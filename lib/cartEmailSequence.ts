import { randomBytes, randomUUID } from "node:crypto";
import { Resend } from "resend";
import { adminStore, digest } from "./admin/store";
import { CUSTOMER_QUEUE, followupRecordKey, type FollowupLead } from "./checkoutFollowup";
import { cartRecoveryEmail, type CartRecoveryStep } from "./emails/cartRecovery";
import { followupPaymentState } from "./followupPaystack";
import { PRODUCT } from "./product";
import type { OrderItem } from "./orderTypes";
import { createAbandonedCartVoucher, type VoucherReward } from "./vouchers";

const HOUR = 60 * 60 * 1000;
const SEND_WINDOW = 23 * HOUR;
const CAMPAIGN_TTL = 30 * 24 * 60 * 60;
const RECOVERY_TTL = 10 * 24 * 60 * 60;
const UNSUBSCRIBE_TTL = 2 * 365 * 24 * 60 * 60;
const RETRY_DELAY = 5 * 60 * 1000;
const NEXT_DELAYS = [23 * HOUR, 48 * HOUR] as const;
const mode = () => process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
const prefix = () => `smelt:cart-email:v1:${mode()}`;
const campaignKey = (id: string) => `${prefix()}:campaign:${id}`;
const recoveryKey = (token: string) => `${prefix()}:recovery:${digest(token)}`;
const unsubscribeKey = (token: string) => `${prefix()}:unsubscribe:${digest(token)}`;
const suppressionKey = (email: string) => `${prefix()}:suppressed:${digest(email.trim().toLowerCase())}`;
const receiptKey = (id: string, step: CartRecoveryStep) => `${prefix()}:receipt:${id}:${step}`;

type Message = { from: string; to: string; subject: string; html: string; text: string };
type Receipt =
  | { status: "pending"; startedAt: number; message: Message }
  | { status: "accepted"; id: string; acceptedAt: string }
  | { status: "manual"; reason: string; at: string };

type CampaignStatus = "active" | "completed" | "paid" | "unsubscribed" | "consent_withdrawn" | "manual";
type CartCampaign = {
  id: string;
  email: string;
  name: string;
  cart: FollowupLead["cart"];
  leadVersion: string;
  createdAt: number;
  updatedAt: number;
  nextStep: CartRecoveryStep;
  nextDue: number;
  status: CampaignStatus;
  recoveryToken: string;
  unsubscribeToken: string;
  voucher: VoucherReward;
};

const parseStored = <T>(value: T | string | null): T | null => {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as T; } catch { return null; }
};

function configuration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  const siteUrl = process.env.SITE_URL || "https://saunahat.co.za";
  if (!apiKey || !from || from.includes("@resend.dev") || !process.env.PAYSTACK_SECRET_KEY)
    throw new Error("cart_email_configuration_incomplete");
  const parsed = new URL(siteUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("cart_email_site_url_invalid");
  return { apiKey, from, siteUrl: parsed.origin };
}

export function cartEmailsEnabled() {
  return process.env.CART_EMAIL_SEQUENCE_ENABLED === "true";
}

export function cartEmailsConfigured() {
  if (!cartEmailsEnabled()) return false;
  try {
    configuration();
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  } catch { return false; }
}

function itemsFor(lead: FollowupLead): OrderItem[] {
  return (["green", "cream"] as const)
    .filter((colour) => lead.cart[colour] > 0)
    .map((colour) => ({ colour, name: PRODUCT.variants[colour].name, qty: lead.cart[colour] }));
}

async function getOrCreateCampaign(lead: FollowupLead, now: number): Promise<CartCampaign | null> {
  const db = adminStore();
  const existing = parseStored(await db.get<CartCampaign>(campaignKey(lead.id)));
  if (existing) return existing;

  const recoveryToken = randomBytes(32).toString("base64url");
  const unsubscribeToken = randomBytes(32).toString("base64url");
  const voucher = createAbandonedCartVoucher(lead.email, lead.id, new Date(now));
  const campaign: CartCampaign = {
    id: lead.id,
    email: lead.email,
    name: lead.name,
    cart: lead.cart,
    leadVersion: lead.version,
    createdAt: now,
    updatedAt: now,
    nextStep: 0,
    nextDue: now,
    status: "active",
    recoveryToken,
    unsubscribeToken,
    voucher: voucher.reward,
  };
  const created = await db.eval<unknown[], CartCampaign | string | null>(`
if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('GET', KEYS[1]) end
if redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', ARGV[3]) == false then return nil end
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[5])
redis.call('SET', KEYS[4], ARGV[6], 'EX', ARGV[7])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[8])
return redis.call('GET', KEYS[1])`, [
    campaignKey(lead.id), voucher.voucherKey, recoveryKey(recoveryToken), unsubscribeKey(unsubscribeToken),
  ], [
    JSON.stringify(campaign), JSON.stringify(voucher.record), voucher.ttl,
    lead.id, RECOVERY_TTL, JSON.stringify({ email: lead.email, id: lead.id }), UNSUBSCRIBE_TTL, CAMPAIGN_TTL,
  ]);
  return parseStored(created);
}

async function stopCampaign(campaign: CartCampaign, status: Exclude<CampaignStatus, "active" | "completed">) {
  const db = adminStore();
  await db.eval(`
local raw = redis.call('GET', KEYS[1])
if raw then
  local campaign = cjson.decode(raw)
  campaign.status = ARGV[2]
  campaign.updatedAt = tonumber(ARGV[3])
  redis.call('SET', KEYS[1], cjson.encode(campaign), 'KEEPTTL')
end
redis.call('ZREM', KEYS[2], ARGV[1])
return 1`, [campaignKey(campaign.id), CUSTOMER_QUEUE], [campaign.id, status, Date.now()]);
}

async function finalizeStep(campaign: CartCampaign, step: CartRecoveryStep, now: number) {
  const done = step === 2;
  const nextDue = done ? now : now + NEXT_DELAYS[step];
  await adminStore().eval(`
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[2], ARGV[1]); return 0 end
local campaign = cjson.decode(raw)
if campaign.status ~= 'active' or campaign.nextStep ~= tonumber(ARGV[2]) then return 0 end
campaign.updatedAt = tonumber(ARGV[3])
campaign.nextDue = tonumber(ARGV[4])
if ARGV[5] == '1' then
  campaign.status = 'completed'
  redis.call('ZREM', KEYS[2], ARGV[1])
else
  campaign.nextStep = campaign.nextStep + 1
  redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
end
redis.call('SET', KEYS[1], cjson.encode(campaign), 'KEEPTTL')
return 1`, [campaignKey(campaign.id), CUSTOMER_QUEUE], [campaign.id, step, now, nextDue, done ? "1" : "0"]);
}

async function deliver(campaign: CartCampaign, lead: FollowupLead, now: number): Promise<"sent" | "accepted" | "manual"> {
  const step = campaign.nextStep;
  const config = configuration();
  const recoveryUrl = new URL(`/checkout/recover/${campaign.recoveryToken}`, config.siteUrl).toString();
  const unsubscribeUrl = new URL(`/email/unsubscribe/${campaign.unsubscribeToken}`, config.siteUrl).toString();
  const email = cartRecoveryEmail({ step, name: lead.name, items: itemsFor(lead), recoveryUrl, unsubscribeUrl, voucher: campaign.voucher });
  const proposed: Extract<Receipt, { status: "pending" }> = {
    status: "pending",
    startedAt: now,
    message: { from: config.from, to: campaign.email, ...email },
  };
  const db = adminStore();
  const receipt = parseStored(await db.eval<unknown[], Receipt | string>(
    "redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]); return redis.call('GET', KEYS[1])",
    [receiptKey(campaign.id, step)], [JSON.stringify(proposed), CAMPAIGN_TTL],
  ));
  if (!receipt) throw new Error("cart_email_receipt_missing");
  if (receipt.status === "accepted") return "accepted";
  if (receipt.status === "manual" || now - receipt.startedAt >= SEND_WINDOW) {
    await db.set(receiptKey(campaign.id, step), { status: "manual", reason: "ambiguous_delivery", at: new Date(now).toISOString() } satisfies Receipt, { keepTtl: true });
    return "manual";
  }
  const result = await new Resend(config.apiKey).emails.send(receipt.message, {
    idempotencyKey: `cart-recovery/${campaign.id}/${step}`,
  });
  if (result.error || !result.data?.id) throw new Error("cart_email_not_accepted");
  await db.set(receiptKey(campaign.id, step), {
    status: "accepted", id: result.data.id, acceptedAt: new Date(now).toISOString(),
  } satisfies Receipt, { keepTtl: true });
  return "sent";
}

export async function processCartEmails(now = Date.now()) {
  const db = adminStore();
  const lock = randomUUID();
  const lockKey = `${prefix()}:lock`;
  if (!await db.set(lockKey, lock, { nx: true, ex: 240 })) return { busy: true };
  const counts = { sent: 0, suppressed: 0, paid: 0, deferred: 0, manual: 0, errors: 0 };
  const deadline = Date.now() + 180_000;
  try {
    const ids = await db.zrange<string[]>(CUSTOMER_QUEUE, 0, now, { byScore: true, offset: 0, count: 10 });
    for (const id of ids) {
      if (Date.now() > deadline) break;
      try {
        const lead = parseStored(await db.get<FollowupLead>(followupRecordKey(id)));
        if (!lead) { await db.zrem(CUSTOMER_QUEUE, id); counts.suppressed++; continue; }
        let campaign = parseStored(await db.get<CartCampaign>(campaignKey(id)));
        const suppressed = await db.exists(suppressionKey(lead.email));
        if (!lead.marketingConsent || suppressed || (campaign && campaign.email !== lead.email)) {
          if (campaign?.status === "active") await stopCampaign(campaign, lead.marketingConsent ? "unsubscribed" : "consent_withdrawn");
          else await db.zrem(CUSTOMER_QUEUE, id);
          counts.suppressed++; continue;
        }
        if (campaign?.status && campaign.status !== "active") { await db.zrem(CUSTOMER_QUEUE, id); counts.suppressed++; continue; }
        const dueAt = campaign?.nextDue ?? lead.updatedAt + HOUR;
        if (now - dueAt >= SEND_WINDOW) {
          if (campaign) await stopCampaign(campaign, "manual"); else await db.zrem(CUSTOMER_QUEUE, id);
          counts.manual++; continue;
        }
        if (campaign && campaign.leadVersion !== lead.version) {
          campaign = { ...campaign, name: lead.name, cart: lead.cart, leadVersion: lead.version, updatedAt: now };
          await db.set(campaignKey(id), campaign, { keepTtl: true });
        }
        if (campaign && campaign.nextDue > now) {
          await db.zadd(CUSTOMER_QUEUE, { member: id, score: campaign.nextDue });
          counts.deferred++; continue;
        }
        const payment = await followupPaymentState(campaign?.email ?? lead.email, lead.createdAt);
        if (payment === "paid") {
          if (campaign) await stopCampaign(campaign, "paid"); else await db.zrem(CUSTOMER_QUEUE, id);
          counts.paid++; continue;
        }
        if (payment === "pending") {
          await db.zadd(CUSTOMER_QUEUE, { member: id, score: now + 30 * 60 * 1000 });
          counts.deferred++; continue;
        }
        campaign ??= await getOrCreateCampaign(lead, now);
        if (!campaign) throw new Error("cart_campaign_not_created");
        const result = await deliver(campaign, lead, now);
        if (result === "manual") {
          await stopCampaign(campaign, "manual"); counts.manual++; continue;
        }
        await finalizeStep(campaign, campaign.nextStep, now);
        if (result === "sent") counts.sent++;
      } catch (error) {
        counts.errors++;
        console.error("Cart recovery email deferred", { id: digest(id), code: error instanceof Error ? error.message : "unknown" });
        await db.zadd(CUSTOMER_QUEUE, { member: id, score: now + RETRY_DELAY });
      }
    }
    return counts;
  } finally {
    await db.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [lockKey], [lock]);
  }
}

export async function getCartRecovery(token: string): Promise<{ email: string; name: string; cart: FollowupLead["cart"]; voucher: VoucherReward } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = adminStore();
  const id = await db.get<string>(recoveryKey(token));
  if (!id) return null;
  const campaign = parseStored(await db.get<CartCampaign>(campaignKey(id)));
  if (!campaign || campaign.recoveryToken !== token || campaign.status === "paid" || Date.parse(campaign.voucher.expiresAt) <= Date.now()) return null;
  return { email: campaign.email, name: campaign.name, cart: campaign.cart, voucher: campaign.voucher };
}

export async function unsubscribeCartEmails(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const db = adminStore();
  const target = parseStored(await db.get<{ email: string; id: string }>(unsubscribeKey(token)));
  if (!target?.email || !target.id) return false;
  await db.set(suppressionKey(target.email), { at: new Date().toISOString(), source: "customer" });
  const campaign = parseStored(await db.get<CartCampaign>(campaignKey(target.id)));
  if (campaign) await stopCampaign(campaign, "unsubscribed");
  else await db.zrem(CUSTOMER_QUEUE, target.id);
  return true;
}
