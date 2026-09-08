import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { sanitizeCart, checkoutTotal } from "./checkoutShared";
import type { CartState } from "./cartReducer";
import { PRODUCT } from "./product";
import { followupPaymentState } from "./followupPaystack";

export const FOLLOWUP_DELAY = 30 * 60 * 1000;
const RETENTION = 7 * 24 * 60 * 60;
const PREFIX = "smelt:followup:v1:";
const QUEUE = `${PREFIX}due`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const recordKey = (id: string) => `${PREFIX}checkout:${id}`;

export type FollowupLead = {
  id: string; email: string; name: string; cart: CartState;
  stage: "details" | "payment_opened" | "payment_closed" | "checkout_error";
  createdAt: number; updatedAt: number; version: string;
};
type Notice = {
  lead: FollowupLead; startedAt: number; delivered: boolean;
  message: { from: string; to: string; subject: string; text: string };
};

export function followupConfigured(): boolean {
  return process.env.CHECKOUT_FOLLOWUP_ENABLED === "true" && Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

function redis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(10_000),
  });
}

export function parseFollowup(input: unknown, now = Date.now()): FollowupLead | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id)) return null;
  const cart = sanitizeCart(body.cart);
  if (checkoutTotal(cart) <= 0) return null;
  const stages = ["details", "payment_opened", "payment_closed", "checkout_error"];
  return {
    id: body.id, email, cart,
    name: typeof body.name === "string" ? body.name.trim().slice(0, 100) : "",
    stage: stages.includes(String(body.stage)) ? body.stage as FollowupLead["stage"] : "details",
    createdAt: now, updatedAt: now, version: randomUUID(),
  };
}

// Atomic updates prevent a slow save from resurrecting a completed record.
export const SAVE_FOLLOWUP = `
local old = redis.call('GET', KEYS[1])
local lead = cjson.decode(ARGV[1])
if old then
  local previous = cjson.decode(old)
  if previous.updatedAt > lead.updatedAt then return 0 end
  if previous.email == lead.email then
    if previous.closed then return 0 end
    lead.createdAt = previous.createdAt
  end
end
redis.call('SET', KEYS[1], cjson.encode(lead), 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], lead.id)
return 1`;

export async function saveFollowup(lead: FollowupLead, ip: string): Promise<boolean> {
  const db = redis();
  const allowed = await db.eval<unknown[], number>(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return count <= 30 and 1 or 0`, [`${PREFIX}rate:${hash(ip)}`], []);
  if (!allowed) return false;
  await db.eval(SAVE_FOLLOWUP, [recordKey(lead.id), QUEUE], [
    JSON.stringify(lead), lead.updatedAt + FOLLOWUP_DELAY, RETENTION,
  ]);
  return true;
}

export function followupMessage(lead: FollowupLead): string {
  const stages = {
    details: "Delivery details form",
    payment_opened: "Payment was started",
    payment_closed: "Payment window was closed",
    checkout_error: "Checkout reported an error",
  };
  const items = (Object.keys(lead.cart) as Array<keyof CartState>)
    .filter((colour) => lead.cart[colour] > 0)
    .map((colour) => `${PRODUCT.variants[colour].name} × ${lead.cart[colour]}`).join("\n");
  return [
    "A checkout has been inactive for at least 30 minutes, with no confirmed payment found.",
    `Email: ${lead.email}`, `Name: ${lead.name || "Not provided"}`,
    items, `Checkout total: R${checkoutTotal(lead.cart).toFixed(2)}`,
    `Last activity: ${new Date(lead.updatedAt).toISOString()}`,
    `Last observed step: ${stages[lead.stage]}`,
    "The reason for leaving is unknown. Browser activity is not a payment confirmation.",
    "Check Paystack again before contacting them; they may have paid since this alert.",
    "https://dashboard.paystack.com/",
    "No customer email or free-shipping offer has been sent. Follow up personally if appropriate.",
    "Advert consent is managed outside the site and has not been verified by this feature.",
  ].join("\n\n");
}

async function closeLead(db: Redis, lead: FollowupLead) {
  await db.eval(`
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('ZREM', KEYS[2], ARGV[1]); return 0 end
local lead = cjson.decode(raw)
if lead.version ~= ARGV[2] then return 0 end
lead.closed = true
redis.call('SET', KEYS[1], cjson.encode(lead), 'KEEPTTL')
redis.call('ZREM', KEYS[2], ARGV[1])
return 1`, [recordKey(lead.id), QUEUE], [lead.id, lead.version]);
}

export async function processFollowups() {
  const db = redis();
  const lockKey = `${PREFIX}lock`;
  const lock = randomUUID();
  if (!await db.set(lockKey, lock, { nx: true, ex: 240 })) return { busy: true };
  const counts = { alerted: 0, suppressed: 0, deferred: 0, errors: 0 };
  const deadline = Date.now() + 180_000;
  try {
    const ids = await db.zrange<string[]>(QUEUE, 0, Date.now(), { byScore: true, offset: 0, count: 10 });
    for (const id of ids) {
      if (Date.now() > deadline) break;
      try {
        const lead = await db.get<FollowupLead>(recordKey(id));
        if (!lead) { await db.zrem(QUEUE, id); continue; }
        if (lead.updatedAt + FOLLOWUP_DELAY > Date.now()) continue;
        // Query Paystack directly: catches purchases in other tabs and missed webhooks.
        const state = await followupPaymentState(lead.email, lead.createdAt);
        if (state === "paid") {
          await closeLead(db, lead); counts.suppressed++; continue;
        }
        if (state === "pending") {
          await db.zadd(QUEUE, { member: id, score: Date.now() + FOLLOWUP_DELAY });
          counts.deferred++; continue;
        }
        const noticeKey = `${PREFIX}notice:${hash(lead.email)}`;
        // Freeze the message for retries so Resend's idempotency key always has the same body.
        const notice = await db.eval<unknown[], Notice | null>(`
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local current = cjson.decode(raw)
if current.closed or current.version ~= ARGV[1] then return nil end
redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', ARGV[3])
return redis.call('GET', KEYS[2])`, [recordKey(id), noticeKey], [lead.version,
          JSON.stringify({
            lead, startedAt: Date.now(), delivered: false,
            message: {
              from: process.env.ORDER_FROM_EMAIL!, to: process.env.CHECKOUT_FOLLOWUP_TO!,
              subject: "Smelt: checkout ready for personal follow-up", text: followupMessage(lead),
            },
          }), RETENTION]);
        if (!notice) continue;
        if (notice.delivered) { await closeLead(db, lead); counts.suppressed++; continue; }
        // Resend retains idempotency keys for 24h. Stop ambiguous retries before that expires.
        if (Date.now() - notice.startedAt >= 23 * 60 * 60 * 1000) {
          console.error("Checkout follow-up delivery needs manual review", { id });
          await closeLead(db, lead); counts.errors++; continue;
        }
        const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
          notice.message, { idempotencyKey: `checkout-followup/${notice.lead.version}` },
        );
        if (result.error || !result.data?.id) throw new Error("Follow-up notification delivery failed");
        await db.set(noticeKey, { ...notice, delivered: true }, { keepTtl: true });
        await closeLead(db, lead);
        counts.alerted++;
      } catch {
        // Keep failed work queued. Do not expose provider payloads or customer data in logs.
        counts.errors++;
        console.error("Checkout follow-up deferred after provider error", { id });
        await db.zadd(QUEUE, { member: id, score: Date.now() + 5 * 60 * 1000 });
      }
    }
    return counts;
  } finally {
    await db.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [lockKey], [lock]);
  }
}
