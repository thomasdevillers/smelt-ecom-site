import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { Resend } from "resend";
import { adminStore, digest } from "../lib/admin/store";
import { customerThankYouAudience, type CompletedCustomerOrder } from "../lib/customerThankYouAudience";
import { customerThankYouEmail } from "../lib/emails/customerThankYou";

const SITE = "https://www.saunahat.co.za";
const DIRECTORY = ".local/customer-thank-you";
const PREFIX = "smelt:customer-thank-you:v1:live:smelt100";
const RECEIPTS = `${PREFIX}:recipients`;
const DAILY_LIMIT = 75;
type Receipt = {
  email: string; references: string[]; status: "pending" | "accepted" | "rejected";
  startedAt: string; acceptedAt?: string; emailId?: string; error?: string;
  idempotencyKey: string;
};

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--send")) throw new Error("Usage: tsx --env-file=.env.local scripts/send-customer-thank-you.ts [--send]");
  const sending = args.includes("--send");
  const { RESEND_API_KEY: apiKey, ORDER_FROM_EMAIL: from, ADMIN_PASSWORD: password } = process.env;
  if (!apiKey || !from || from.includes("@resend.dev") || !password) throw new Error("Verified sender, Resend key and admin password required.");
  // Production secrets are not printed or copied into the campaign log. The live
  // order API accesses Paystack; a local test Paystack key must never select buyers.
  const production = parseEnv(await readFile(`${DIRECTORY}/production.env`, "utf8"));
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    if (!production[name] || production[name] === "[SENSITIVE]") throw new Error(`Production ${name} is unavailable.`);
    process.env[name] = production[name];
  }
  process.env.SITE_URL = "https://saunahat.co.za";
  const db = adminStore();
  const resend = new Resend(apiKey);
  await mkdir(DIRECTORY, { recursive: true, mode: 0o700 });
  const login = await fetch(`${SITE}/api/admin/session`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error(`Production admin login failed (${login.status}).`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Production login did not return a session.");
  const lockToken = randomUUID();
  let locked = false;
  async function api(path: string) {
    const response = await fetch(`${SITE}/api/admin/${path}`, { headers: { Cookie: cookie! }, cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Production ${path} failed (${response.status}).`);
    return response.json();
  }
  try {
    const orders: CompletedCustomerOrder[] = [];
    const first = await api("orders?view=completed&page=1&sort=oldest");
    if (!Number.isSafeInteger(first.pageCount) || !Array.isArray(first.orders)) throw new Error("Invalid completed-order response.");
    orders.push(...first.orders);
    for (let page = 2; page <= first.pageCount; page++) {
      const result = await api(`orders?view=completed&page=${page}&sort=oldest`);
      if (result.page !== page || result.total !== first.total || !Array.isArray(result.orders)) throw new Error("Completed orders changed during preparation; rerun before sending.");
      orders.push(...result.orders);
    }
    const completed = await db.hgetall<Record<string, string>>("smelt:orders:completed:v1:live");
    if (orders.length !== first.total || orders.some(order => !completed?.[order.reference])) throw new Error("Could not confirm the entire audience against live completion records.");
    const { customers, invalidEmails } = customerThankYouAudience(orders);
    const records = await db.hgetall<Record<string, Receipt>>(RECEIPTS) || {};
    const suppressed = new Set<string>();
    // Respect previous cart-email opt-outs, including withdrawals before purchase.
    for (const customer of customers) {
      const optOut = await db.get(`smelt:cart-email:v1:live:suppressed:${digest(customer.email)}`);
      if (optOut) suppressed.add(customer.email);
    }
    // Count the last 24 hours conservatively, rather than assuming a quota reset.
    // Also omit recipients with recorded hard bounces, complaints or suppression.
    let last24h = 0;
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await resend.emails.list({ limit: 100, ...(after ? { after } : {}) });
      if (result.error || !result.data) throw new Error(`Cannot verify Resend quota/history: ${result.error?.message || "missing data"}`);
      for (const email of result.data.data) {
        if (Date.parse(email.created_at) > Date.now() - 86_400_000) last24h += email.to.length + (email.cc?.length || 0) + (email.bcc?.length || 0);
        if (["bounced", "complained", "suppressed"].includes(email.last_event)) for (const address of email.to) suppressed.add(address.trim().toLowerCase());
      }
      if (!result.data.has_more) break;
      after = result.data.data.at(-1)?.id;
      if (!after || page === 99) throw new Error("Cannot verify complete email history.");
      await delay(650);
    }
    const pending = customers.filter(customer => !suppressed.has(customer.email) && !records[digest(customer.email)]);
    const day = new Date().toISOString().slice(0, 10);
    const dailyKey = `${PREFIX}:attempts:${day}`;
    const usedToday = Number(await db.get(dailyKey) || 0);
    // Leave at least five sends for ordinary store mail, in addition to the
    // campaign's own hard cap of 75. Provider quota errors stop the run.
    const availableToday = Math.max(0, Math.min(DAILY_LIMIT - usedToday, 100 - last24h - 5));
    const selected = pending.slice(0, availableToday);
    const coupon = (await api("coupons")).coupons?.find((item: { code: string }) => item.code === "SMELT100");
    const summary = {
      campaign: PREFIX, preparedAt: new Date().toISOString(), completedOrders: orders.length,
      uniqueCustomers: customers.length, invalidEmails, suppressed: customers.filter(c => suppressed.has(c.email)).length,
      alreadyAccepted: Object.values(records).filter(r => r.status === "accepted").length,
      unresolvedOrRejected: Object.values(records).filter(r => r.status !== "accepted").length,
      emailsInLast24Hours: last24h, campaignAttemptsToday: usedToday,
      selected: selected.length, remainingAfterBatch: pending.length - selected.length,
      couponReady: Boolean(coupon?.active && coupon.amount === 100 && coupon.minHats === 2 && coupon.maxUses > coupon.redeemed + coupon.held),
    };
    await writeFile(`${DIRECTORY}/audience.json`, JSON.stringify({ ...summary, selected, waiting: pending.slice(selected.length), suppressed: customers.filter(c => suppressed.has(c.email)) }, null, 2), { mode: 0o600 });
    await writeFile(`${DIRECTORY}/send-log.json`, JSON.stringify(records, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(summary, null, 2));
    if (!sending) return;
    if (!summary.couponReady) throw new Error("No emails sent: live SMELT100 must be active, R100 off, minimum 2 hats, with uses available. Create it and deploy the minimum-hat support before sending.");
    if (!selected.length) throw new Error("No recipients available within today's safe send limit.");
    locked = await db.set(`${PREFIX}:lock`, lockToken, { nx: true, ex: 900 }) === "OK";
    if (!locked) throw new Error("Another campaign run is active; no emails sent.");
    let accepted = 0;
    for (const customer of selected) {
      if (new Date().toISOString().slice(0, 10) !== day) throw new Error("Date changed; stop and recheck quota.");
      const hash = digest(customer.email);
      // Recheck completion and suppression immediately before freezing a send.
      const liveCompleted = await db.hgetall<Record<string, string>>("smelt:orders:completed:v1:live");
      if (!customer.references.some(reference => liveCompleted?.[reference])) continue;
      if (await db.get(`smelt:cart-email:v1:live:suppressed:${hash}`)) continue;
      const message = customerThankYouEmail(customer.name);
      // Keep the hand-typed appearance while giving buyers an explicit opt-out.
      const optOut = "Prefer not to receive emails like this? Reply 'unsubscribe'.";
      message.text += `\n\n${optOut}`;
      message.html = message.html.replace("</body>", `<p style="margin:0 0 16px;">${optOut}</p></body>`);
      const receipt: Receipt = { email: customer.email, references: customer.references, status: "pending", startedAt: new Date().toISOString(), idempotencyKey: `${PREFIX}:${hash}` };
      // A durable pending record is required BEFORE Resend. Never automatically
      // resend pending/rejected records, even after provider idempotency expires.
      const claimed = await db.eval<unknown[], number>(`
if redis.call('GET', KEYS[3]) ~= ARGV[4] then return -1 end
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= 75 then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[3], 900)
return 1`, [RECEIPTS, dailyKey, `${PREFIX}:lock`], [hash, JSON.stringify({ ...receipt, message }), day, lockToken]);
      if (claimed === -1) throw new Error("Campaign daily limit reached or lock lost; stopped safely.");
      if (claimed !== 1) continue;
      records[hash] = receipt;
      await writeFile(`${DIRECTORY}/send-log.json`, JSON.stringify(records, null, 2), { mode: 0o600 });
      const result = await resend.emails.send({ from, to: customer.email, replyTo: from.match(/<([^>]+)>/)?.[1] || from, ...message }, { idempotencyKey: receipt.idempotencyKey });
      if (result.error || !result.data?.id) {
        receipt.status = "rejected";
        receipt.error = result.error?.message || "No email ID returned; reconcile before retrying";
        await db.hset(RECEIPTS, { [hash]: JSON.stringify(receipt) });
        await writeFile(`${DIRECTORY}/send-log.json`, JSON.stringify(records, null, 2), { mode: 0o600 });
        throw new Error(`Stopped after ${accepted} accepted emails: ${receipt.error}`);
      }
      receipt.status = "accepted"; receipt.emailId = result.data.id; receipt.acceptedAt = new Date().toISOString();
      await db.hset(RECEIPTS, { [hash]: JSON.stringify(receipt) });
      await writeFile(`${DIRECTORY}/send-log.json`, JSON.stringify(records, null, 2), { mode: 0o600 });
      accepted++;
      console.log(`Accepted ${accepted}/${selected.length}; recipient ${hash.slice(0, 12)}; message ${result.data.id}`);
      await delay(700);
    }
    console.log(`Batch finished: ${accepted} accepted. Recipients are recorded in shared Redis and ${DIRECTORY}/send-log.json. Tomorrow requires a new explicit run.`);
  } finally {
    if (locked) await db.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [`${PREFIX}:lock`], [lockToken]);
    await fetch(`${SITE}/api/admin/session`, { method: "DELETE", headers: { Cookie: cookie, Origin: SITE } });
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Campaign failed; check the persistent log before retrying."); process.exitCode = 1; });
