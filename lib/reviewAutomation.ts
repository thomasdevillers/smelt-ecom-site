import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { completionKey } from "./admin/orders";
import { adminStore, digest } from "./admin/store";
import { reviewRequestEmail } from "./emails/reviewRequest";
import { reviewRewardEmail } from "./emails/reviewReward";
import { createReviewInvitation, hasCurrentReviewInvitation, hasReviewForOrder } from "./reviewStore";
import { getStoredReward, publicVoucherReward, rewardQueueKey } from "./vouchers";

export const REVIEW_REQUEST_DELAY_DAYS = 10;
const SEND_WINDOW = 23 * 60 * 60 * 1000;
const mode = () => process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
const prefix = () => `smelt:review-outreach:v1:${mode()}`;
const requestKey = (reference: string) => `${prefix()}:request:${digest(reference)}`;
const rewardReceiptKey = (reviewId: string) => `${prefix()}:reward:${reviewId}`;

type Message = { from: string; to: string; subject: string; html: string; text: string };
type Receipt = { status: "pending"; startedAt: number; message: Message } | { status: "accepted"; id: string; acceptedAt: string } | { status: "skipped" | "manual"; reason: string; at: string };

function configuration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;
  if (!apiKey || !from || from.includes("@resend.dev")) throw new Error("review_email_configuration_incomplete");
  return { apiKey, from };
}

async function deliver(key: string, idempotencyKey: string, proposed: Extract<Receipt, { status: "pending" }>): Promise<Receipt> {
  const db = adminStore();
  const receipt = await db.eval<unknown[], Receipt>(
    "redis.call('SET', KEYS[1], ARGV[1], 'NX'); return redis.call('GET', KEYS[1])",
    [key], [JSON.stringify(proposed)],
  );
  if (receipt.status !== "pending") return receipt;
  if (!Number.isFinite(receipt.startedAt) || Date.now() - receipt.startedAt >= SEND_WINDOW) throw new Error("review_email_manual_review_required");
  const result = await new Resend(configuration().apiKey).emails.send(receipt.message, { idempotencyKey });
  if (result.error || !result.data?.id) throw new Error("review_email_not_accepted");
  const accepted: Receipt = { status: "accepted", id: result.data.id, acceptedAt: new Date().toISOString() };
  await db.set(key, accepted);
  return accepted;
}

export function reviewRequestsConfigured() {
  return process.env.REVIEW_REQUESTS_ENABLED === "true" && Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.PAYSTACK_SECRET_KEY &&
    process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL && !process.env.ORDER_FROM_EMAIL.includes("@resend.dev"),
  );
}

export function reviewRequestsEnabled() {
  return process.env.REVIEW_REQUESTS_ENABLED === "true";
}

export function reviewRewardsConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN &&
    process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL && !process.env.ORDER_FROM_EMAIL.includes("@resend.dev"));
}

export async function processReviewRequests(now = Date.now()) {
  const db = adminStore();
  const lock = randomUUID();
  const lockKey = `${prefix()}:request-lock`;
  if (!await db.set(lockKey, lock, { nx: true, ex: 240 })) return { busy: true };
  const counts = { sent: 0, skipped: 0, errors: 0 };
  try {
    const completed = await db.hgetall<Record<string, string>>(completionKey()) || {};
    const cutoff = now - REVIEW_REQUEST_DELAY_DAYS * 24 * 60 * 60 * 1000;
    const due = Object.entries(completed)
      .filter(([, completedAt]) => Number.isFinite(Date.parse(completedAt)) && Date.parse(completedAt) <= cutoff)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .slice(0, 10);
    for (const [reference] of due) {
      try {
        const existing = await db.get<Receipt>(requestKey(reference));
        if (existing?.status === "pending") {
          const retried = await deliver(requestKey(reference), `review-request/${digest(reference)}`, existing);
          if (retried.status === "accepted") counts.sent++;
          continue;
        }
        if (existing) continue;
        if (await hasReviewForOrder(reference)) {
          await db.set(requestKey(reference), { status: "skipped", reason: "review_exists", at: new Date(now).toISOString() } satisfies Receipt);
          counts.skipped++; continue;
        }
        if (await hasCurrentReviewInvitation(reference)) {
          await db.set(requestKey(reference), { status: "skipped", reason: "invitation_exists", at: new Date(now).toISOString() } satisfies Receipt);
          counts.skipped++; continue;
        }
        const invitation = await createReviewInvitation(reference);
        const reviewUrl = new URL(`/review/${invitation.token}`, process.env.SITE_URL || "https://saunahat.co.za").toString();
        const message = { from: configuration().from, to: invitation.email, ...reviewRequestEmail({ name: invitation.suggestedName, reviewUrl }) };
        const receipt = await deliver(requestKey(reference), `review-request/${digest(reference)}`, { status: "pending", startedAt: now, message });
        if (receipt.status === "accepted") counts.sent++;
      } catch (error) {
        counts.errors++;
        if (error instanceof Error && error.message === "review_email_manual_review_required") {
          await db.set(requestKey(reference), { status: "manual", reason: "ambiguous_delivery", at: new Date(now).toISOString() } satisfies Receipt);
        }
        console.error("Review request deferred for manual review", { reference: digest(reference), code: error instanceof Error ? error.message : "unknown" });
      }
    }
    return counts;
  } finally {
    await db.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [lockKey], [lock]);
  }
}

export async function sendReviewReward(reviewId: string) {
  const reward = await getStoredReward(reviewId);
  if (!reward) throw new Error("review_reward_not_found");
  const message = { from: configuration().from, to: reward.email, ...reviewRewardEmail({ voucher: publicVoucherReward(reward) }) };
  const receipt = await deliver(rewardReceiptKey(reviewId), `review-reward/${reviewId}`, { status: "pending", startedAt: Date.now(), message });
  if (receipt.status === "accepted") await adminStore().zrem(rewardQueueKey(), reviewId);
  return receipt;
}

export async function processReviewRewards() {
  const db = adminStore();
  const ids = await db.zrange<string[]>(rewardQueueKey(), 0, Date.now(), { byScore: true, offset: 0, count: 10 });
  const counts = { sent: 0, errors: 0 };
  for (const reviewId of ids) {
    try { await sendReviewReward(reviewId); counts.sent++; }
    catch (error) {
      counts.errors++;
      if (error instanceof Error && (error.message === "review_email_manual_review_required" || error.message === "review_reward_not_found")) await db.zrem(rewardQueueKey(), reviewId);
      console.error("Review reward email deferred", { reviewId, code: error instanceof Error ? error.message : "unknown" });
    }
  }
  return counts;
}
