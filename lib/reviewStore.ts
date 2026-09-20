import { randomBytes, randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { AdminError, adminStore, digest } from "./admin/store";
import { completionKey, getPaidOrder } from "./admin/orders";
import { PRODUCT, type Colour } from "./product";
import {
  REVIEW_INVITATION_DAYS,
  REVIEW_PRODUCT_ID,
  photoFromInvitation,
  publicReview,
  reviewSummary,
  validateReviewSubmission,
  type PublicReview,
  type ReviewRecord,
  type ReviewStatus,
} from "./reviews";

const mode = () => process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
const prefix = () => `smelt:reviews:v1:${mode()}`;
const recordsKey = () => `${prefix()}:records`;
const statusKey = (status: ReviewStatus) => `${prefix()}:status:${status}`;
const inviteKey = (tokenDigest: string) => `${prefix()}:invite:${tokenDigest}`;
const currentInviteKey = (reference: string) => `${prefix()}:order:${digest(reference)}:invite`;
const claimKey = (tokenDigest: string) => `${prefix()}:claim:${tokenDigest}`;
const uploadPathsKey = (tokenDigest: string) => `${prefix()}:upload-paths:${tokenDigest}`;

// New Vercel Blob connections use short-lived OIDC credentials at runtime and
// expose the connected store through BLOB_STORE_ID. Older connections can
// still authenticate with a long-lived BLOB_READ_WRITE_TOKEN.
function blobUploadMode(): "presigned" | "client-token" | undefined {
  if (process.env.BLOB_STORE_ID && process.env.BLOB_WEBHOOK_PUBLIC_KEY) return "presigned";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "client-token";
}

export interface ReviewInvitation {
  reference: string;
  email: string;
  suggestedName: string;
  colours: Colour[];
  uploadKey: string;
  createdAt: string;
  expiresAt: string;
}

export interface PublicInvitation {
  valid: boolean;
  used: boolean;
  expiresAt?: string;
  suggestedName?: string;
  colours?: Colour[];
  uploadKey?: string;
  photoUploadsEnabled?: boolean;
  photoUploadMode?: "presigned" | "client-token";
}

function parseStored<T>(value: T | string | null): T | null {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function coloursFromOrder(items: Array<{ colour: string }>): Colour[] {
  return [...new Set(items.map(item => item.colour).filter((colour): colour is Colour => colour === "green" || colour === "cream"))];
}

export async function createReviewInvitation(reference: string) {
  const order = await getPaidOrder(reference);
  const db = adminStore();
  if (!await db.hget<string>(completionKey(), reference))
    throw new AdminError("Mark this order complete before creating a review link.", 409);
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = digest(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + REVIEW_INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const invitation: ReviewInvitation = {
    reference: order.reference,
    email: order.email,
    suggestedName: order.name.split(/\s+/)[0] || "",
    colours: coloursFromOrder(order.items),
    uploadKey: randomBytes(18).toString("base64url"),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const ttl = REVIEW_INVITATION_DAYS * 24 * 60 * 60;
  await db.set(inviteKey(tokenDigest), invitation, { ex: ttl });
  await db.set(currentInviteKey(reference), tokenDigest, { ex: ttl });
  return { token, expiresAt: invitation.expiresAt };
}

async function invitationForToken(token: string): Promise<{ invitation: ReviewInvitation; tokenDigest: string; used: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenDigest = digest(token);
  const db = adminStore();
  const invitation = parseStored(await db.get<ReviewInvitation>(inviteKey(tokenDigest)));
  if (!invitation || Date.parse(invitation.expiresAt) <= Date.now()) return null;
  const [current, claim] = await Promise.all([
    db.get<string>(currentInviteKey(invitation.reference)),
    db.get(claimKey(tokenDigest)),
  ]);
  if (current !== tokenDigest) return null;
  return { invitation, tokenDigest, used: Boolean(claim) };
}

export async function getPublicInvitation(token: string): Promise<PublicInvitation> {
  const found = await invitationForToken(token);
  if (!found) return { valid: false, used: false };
  const photoUploadMode = blobUploadMode();
  return {
    valid: true,
    used: found.used,
    expiresAt: found.invitation.expiresAt,
    suggestedName: found.invitation.suggestedName,
    colours: found.invitation.colours,
    uploadKey: found.invitation.uploadKey,
    photoUploadsEnabled: Boolean(photoUploadMode),
    photoUploadMode,
  };
}

export async function reservePhotoUpload(token: string, pathname: string) {
  const found = await invitationForToken(token);
  if (!found) throw new AdminError("This review link is invalid or has expired.", 404);
  if (found.used) throw new AdminError("This review link has already been used.", 409);
  const prefix = `reviews/pending/${found.invitation.uploadKey}/`;
  if (!pathname.startsWith(prefix) || !/^[^/]+\.(?:webp|jpg)$/.test(pathname.slice(prefix.length)))
    throw new AdminError("Invalid photo path.");
  const allowed = await adminStore().eval(`
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then return 1 end
if redis.call('SCARD', KEYS[1]) >= 3 then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
if redis.call('SCARD', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
return 1`, [uploadPathsKey(found.tokenDigest)], [pathname]);
  if (!allowed) throw new AdminError("This review already has three photo uploads.", 409);
  return found.invitation.uploadKey;
}

const SUBMIT_REVIEW = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
redis.call('SET', KEYS[3], ARGV[2])
redis.call('HSET', KEYS[4], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[5], ARGV[4], ARGV[2])
return 1`;

export async function submitReview(token: string, input: unknown) {
  const found = await invitationForToken(token);
  if (!found) throw new AdminError("This review link is invalid or has expired.", 404);
  if (found.used)
    throw new AdminError("This review link has already been used.", 409);
  const submission = validateReviewSubmission(input);
  const photos = submission.photoUrls.map(url => photoFromInvitation(url, found.invitation.uploadKey));
  if (photos.some(photo => !photo)) throw new AdminError("One of the uploaded photos is not valid.");

  // Recheck the provider when the review is submitted; an invitation alone is
  // not enough to retain the verified-purchase label after a payment reversal.
  const order = await getPaidOrder(found.invitation.reference);
  if (order.email !== found.invitation.email) throw new AdminError("This review link no longer matches the paid order.", 409);

  const id = randomUUID();
  const submittedAt = new Date().toISOString();
  const review: ReviewRecord = {
    id,
    productId: REVIEW_PRODUCT_ID,
    orderReference: order.reference,
    customerEmail: order.email,
    displayName: submission.anonymous ? "Anonymous" : submission.displayName,
    anonymous: submission.anonymous,
    rating: submission.rating,
    body: submission.body,
    colours: found.invitation.colours,
    photos: photos as ReviewRecord["photos"],
    verifiedPurchase: true,
    status: "pending",
    submittedAt,
    publishedAt: null,
    consentVersion: "2026-09-17",
  };
  const db = adminStore();
  const result = await db.eval(
    SUBMIT_REVIEW,
    [inviteKey(found.tokenDigest), currentInviteKey(order.reference), claimKey(found.tokenDigest), recordsKey(), statusKey("pending")],
    [found.tokenDigest, id, JSON.stringify(review), String(Date.parse(submittedAt))],
  );
  if (result === 0) throw new AdminError("This review link has already been used.", 409);
  if (result !== 1) throw new AdminError("This review link is invalid or has expired.", 404);
  return { id, status: "pending" as const };
}

function normalizedRecord(value: ReviewRecord | string): ReviewRecord | null {
  const parsed = parseStored<ReviewRecord>(value);
  return parsed?.productId === REVIEW_PRODUCT_ID ? parsed : null;
}

export async function listReviewRecords(status?: ReviewStatus): Promise<ReviewRecord[]> {
  const stored = await adminStore().hgetall<Record<string, ReviewRecord | string>>(recordsKey()) || {};
  return Object.values(stored)
    .map(normalizedRecord)
    .filter((review): review is ReviewRecord => review !== null && (!status || review.status === status))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getReviewPhoto(id: string, index: number, allowUnpublished = false) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isSafeInteger(index) || index < 0) return null;
  const review = normalizedRecord(await adminStore().hget<ReviewRecord | string>(recordsKey(), id) as ReviewRecord | string);
  if (!review || (review.status !== "published" && !allowUnpublished)) return null;
  return review.photos[index] ?? null;
}

export async function listPublishedReviews(): Promise<{ reviews: PublicReview[]; summary: ReturnType<typeof reviewSummary> }> {
  const reviews = (await listReviewRecords("published"))
    .map(publicReview)
    .filter((review): review is PublicReview => Boolean(review));
  return { reviews, summary: reviewSummary(reviews) };
}

export async function moderateReview(id: string, status: "published" | "rejected") {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new AdminError("Invalid review.");
  const db = adminStore();
  const review = normalizedRecord(await db.hget<ReviewRecord | string>(recordsKey(), id) as ReviewRecord | string);
  if (!review) throw new AdminError("Review not found.", 404);
  const updated: ReviewRecord = {
    ...review,
    status,
    publishedAt: status === "published" ? review.publishedAt || new Date().toISOString() : null,
  };
  await db.hset(recordsKey(), { [id]: updated });
  await Promise.all((["pending", "published", "rejected"] as ReviewStatus[]).map(value => db.zrem(statusKey(value), id)));
  await db.zadd(statusKey(status), { score: Date.parse(updated.submittedAt), member: id });
  if (status === "rejected" && review.photos.length && blobUploadMode()) {
    await del(review.photos.map(photo => photo.url));
    updated.photos = [];
    await db.hset(recordsKey(), { [id]: updated });
  }
  return updated;
}

export async function removeReviewPhoto(id: string, url: string) {
  const db = adminStore();
  const review = normalizedRecord(await db.hget<ReviewRecord | string>(recordsKey(), id) as ReviewRecord | string);
  if (!review) throw new AdminError("Review not found.", 404);
  const photo = review.photos.find(item => item.url === url);
  if (!photo) throw new AdminError("Photo not found.", 404);
  if (blobUploadMode()) await del(photo.url);
  const updated = { ...review, photos: review.photos.filter(item => item.url !== url) };
  await db.hset(recordsKey(), { [id]: updated });
  return updated;
}

export function productName() { return PRODUCT.name; }
