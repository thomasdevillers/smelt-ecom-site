import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Resend } from "resend";
import { earlyShippingEmail } from "../lib/emails/earlyShipping";
import { earlyShippingAudience, eligibleEarlyShippingOrder } from "../lib/earlyShippingAudience";
import type { AdminOrder, OrdersPage } from "../lib/admin/types";

const SITE = "https://www.saunahat.co.za";
const DIRECTORY = ".local/early-shipping";
const CAMPAIGN = "early-shipping-november-2026-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--send"))
    throw new Error(
      "Usage: tsx --env-file-if-exists=.env.local scripts/send-early-shipping.ts [--send]",
    );
  const sending = args.includes("--send");
  const { RESEND_API_KEY: apiKey, ORDER_FROM_EMAIL: from, ADMIN_PASSWORD: password } = process.env;
  if (!apiKey || !from || from.includes("@resend.dev") || !password)
    throw new Error("Verified sender, Resend key and admin password required.");
  // This approved message says tomorrow, 24 November. Never send stale timing.
  if (new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }) !== "2026-11-23")
    throw new Error(
      "The approved tomorrow/24 November copy is no longer current. Stop for review.",
    );
  process.env.SITE_URL = "https://saunahat.co.za";
  await mkdir(`${DIRECTORY}/receipts`, { recursive: true, mode: 0o700 });
  const login = await fetch(`${SITE}/api/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!login.ok) throw new Error(`Production login failed (${login.status}).`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("No production session returned.");
  async function api(path: string) {
    const response = await fetch(`${SITE}/api/admin/${path}`, {
      headers: { Cookie: cookie! },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`Production ${path.split("?")[0]} failed (${response.status}).`);
    return response.json();
  }
  try {
    if ((await api("analytics?days=7")).mode !== "live")
      throw new Error("Production API is not confirmed in live payment mode.");
    const page = await fetch(`${SITE}/help-shape-smelt?frequency=About+weekly`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!page.ok) throw new Error("Live questionnaire is unavailable.");
    const orders: AdminOrder[] = [];
    const first: OrdersPage = await api("orders?view=preorders&page=1");
    if (
      !Number.isSafeInteger(first.total) ||
      !Number.isSafeInteger(first.pageCount) ||
      !Array.isArray(first.orders)
    )
      throw new Error("Invalid production order response.");
    orders.push(...first.orders);
    for (let page = 2; page <= first.pageCount; page++) {
      const result: OrdersPage = await api(`orders?view=preorders&page=${page}`);
      if (result.page !== page || result.total !== first.total || !Array.isArray(result.orders))
        throw new Error("Order list changed; prepare again.");
      orders.push(...result.orders);
    }
    if (
      orders.length !== first.total ||
      new Set(orders.map((order) => order.reference)).size !== orders.length ||
      orders.some((order) => order.completedAt || !order.preorder)
    )
      throw new Error("Cannot confirm a complete, active-preorder-only audience.");
    const { customers, excluded } = earlyShippingAudience(orders);
    const resend = new Resend(apiKey);
    const suppressed = new Set<string>();
    let last24h = 0;
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
      const result = await resend.emails.list({ limit: 100, ...(after ? { after } : {}) });
      if (result.error || !result.data)
        throw new Error(`Cannot verify email history: ${result.error?.message || "missing data"}`);
      for (const email of result.data.data) {
        if (Date.parse(email.created_at) > Date.now() - 86_400_000)
          last24h += email.to.length + (email.cc?.length || 0) + (email.bcc?.length || 0);
        if (["bounced", "complained", "suppressed"].includes(email.last_event))
          for (const address of email.to) suppressed.add(address.trim().toLowerCase());
      }
      if (!result.data.has_more) break;
      after = result.data.data.at(-1)?.id;
      if (!after || page === 99) throw new Error("Cannot confirm complete email history.");
      await delay(650);
    }
    const selected: typeof customers = [];
    let alreadyRecorded = 0;
    for (const customer of customers) {
      try {
        await readFile(`${DIRECTORY}/receipts/${hash(customer.email)}.json`, "utf8");
        alreadyRecorded++;
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (!suppressed.has(customer.email)) selected.push(customer);
    }
    const message = earlyShippingEmail();
    const summary = {
      campaign: CAMPAIGN,
      preparedAt: new Date().toISOString(),
      activePreorders: orders.length,
      completedOrdersExcludedByAPI: first.completedTotal,
      uniqueEligibleCustomers: customers.length,
      excludedOrderReferences: excluded,
      suppressedCustomers: customers.filter((c) => suppressed.has(c.email)).length,
      alreadyRecorded,
      selected: selected.length,
      emailsLast24h: last24h,
      safeCapacity: Math.max(0, 95 - last24h),
      messageHash: hash(JSON.stringify(message)),
    };
    await writeFile(
      `${DIRECTORY}/audience.json`,
      JSON.stringify({ ...summary, selected }, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(summary, null, 2));
    if (!sending) return;
    if (selected.length > summary.safeCapacity)
      throw new Error(
        "Audience exceeds conservative daily capacity. No emails sent; review quota first.",
      );
    let accepted = 0;
    for (const customer of selected) {
      // Recheck live fulfilment/payment state immediately before each send.
      let eligible = false;
      for (const reference of customer.references) {
        const result: OrdersPage = await api(
          `orders?view=preorders&search=${encodeURIComponent(reference)}&page=1`,
        );
        if (
          result.orders.some(
            (order) =>
              order.reference === reference &&
              order.email.trim().toLowerCase() === customer.email &&
              eligibleEarlyShippingOrder(order),
          )
        )
          eligible = true;
      }
      if (!eligible) {
        console.log(`Skipped changed order state: ${hash(customer.email).slice(0, 12)}`);
        continue;
      }
      const path = `${DIRECTORY}/receipts/${hash(customer.email)}.json`;
      const receipt = {
        campaign: CAMPAIGN,
        email: customer.email,
        references: customer.references,
        status: "pending",
        startedAt: new Date().toISOString(),
        messageHash: summary.messageHash,
        emailId: "",
        error: "",
      };
      // Exclusive, durable pending record BEFORE the provider call. Any uncertain
      // result requires manual reconciliation, never an automatic resend.
      const file = await open(path, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(receipt, null, 2));
        await file.sync();
      } finally {
        await file.close();
      }
      const result = await resend.emails.send(
        { from, to: customer.email, ...message },
        { idempotencyKey: `${CAMPAIGN}:${hash(customer.email)}` },
      );
      if (result.error || !result.data?.id) {
        receipt.error = result.error?.message || "No acceptance ID returned";
        await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
        throw new Error(
          `Stopped after ${accepted} accepted: ${receipt.error}. Reconcile pending receipt before retrying.`,
        );
      }
      receipt.status = "accepted";
      receipt.emailId = result.data.id;
      await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
      accepted++;
      console.log(
        `Accepted ${accepted}/${selected.length}; recipient ${hash(customer.email).slice(0, 12)}; message ${result.data.id}`,
      );
      await delay(700);
    }
    console.log(
      `Finished: ${accepted} emails accepted by Resend. Durable receipts: ${DIRECTORY}/receipts`,
    );
  } finally {
    await fetch(`${SITE}/api/admin/session`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: SITE },
      signal: AbortSignal.timeout(15_000),
    });
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Campaign failed; inspect receipts before retrying.",
  );
  process.exitCode = 1;
});
