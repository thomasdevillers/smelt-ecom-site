import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const strings = new Map<string, unknown>();
  const hashes = new Map<string, Map<string, unknown>>();
  const counts = new Map<string, number>();
  const uploadPaths = new Map<string, Set<string>>();
  const db = {
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { strings.set(key, value); return "OK"; }),
    hget: vi.fn(async (key: string, field: string) => hashes.get(key)?.get(field) ?? null),
    hset: vi.fn(async (key: string, values: Record<string, unknown>) => {
      const hash = hashes.get(key) || new Map<string, unknown>();
      Object.entries(values).forEach(([field, value]) => hash.set(field, value));
      hashes.set(key, hash); return Object.keys(values).length;
    }),
    hgetall: vi.fn(async (key: string) => Object.fromEntries(hashes.get(key) || [])),
    zadd: vi.fn(async () => 1), zrem: vi.fn(async () => 1),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      if (script.includes("local ipCount")) return 1;
      if (script.includes("SISMEMBER")) {
        const paths = uploadPaths.get(keys[0]) ?? new Set<string>();
        if (paths.has(args[0])) return 1;
        if (paths.size >= 3) return 0;
        paths.add(args[0]); uploadPaths.set(keys[0], paths); return 1;
      }
      if (!strings.has(keys[0]) || strings.get(keys[1]) !== args[0]) return -1;
      if (strings.has(keys[2])) return 0;
      strings.set(keys[2], args[1]);
      const hash = hashes.get(keys[3]) || new Map<string, unknown>();
      hash.set(args[1], args[2]); hashes.set(keys[3], hash);
      return 1;
    }),
  };
  return { strings, hashes, counts, uploadPaths, db, paidOrder: vi.fn(), paidOrdersByEmail: vi.fn(), blobDelete: vi.fn() };
});

vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return mocks.db; } } }));
vi.mock("@vercel/blob", () => ({ del: mocks.blobDelete }));
vi.mock("./admin/orders", () => ({ completionKey: () => "orders:completed", getPaidOrder: mocks.paidOrder, findPaidOrdersByEmail: mocks.paidOrdersByEmail }));

import {
  createReviewInvitation,
  createReviewInvitationForEmail,
  getPublicInvitation,
  getReviewPhoto,
  listPublishedReviews,
  moderateReview,
  reservePhotoUpload,
  submitReview,
} from "./reviewStore";
import { photoFromInvitation, reviewSummary, validateReviewSubmission, type PublicReview } from "./reviews";
import { POST as reviewAccessPOST } from "@/app/api/reviews/access/route";

const order = {
  reference: "order-1", email: "customer@example.com", name: "Tumi Customer",
  items: [{ colour: "green", name: "Forest Green", qty: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks(); mocks.strings.clear(); mocks.hashes.clear(); mocks.counts.clear(); mocks.uploadPaths.clear();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test");
  vi.stubEnv("BLOB_STORE_ID", "");
  vi.stubEnv("BLOB_WEBHOOK_PUBLIC_KEY", "");
  mocks.paidOrder.mockResolvedValue(order);
  mocks.paidOrdersByEmail.mockResolvedValue([order]);
  mocks.hashes.set("orders:completed", new Map([["order-1", "2026-09-17T12:00:00.000Z"]]));
});

async function invitation() {
  const created = await createReviewInvitation("order-1");
  const visible = await getPublicInvitation(created.token);
  expect(visible).toMatchObject({ valid: true, used: false, suggestedName: "Tumi", colours: ["green"] });
  return { ...created, visible };
}

describe("review invitations and verified submission", () => {
  it("opens the existing review form for a completed order email", async () => {
    const created = await createReviewInvitationForEmail(" Customer@Example.com ", "127.0.0.1");
    expect(mocks.paidOrdersByEmail).toHaveBeenCalledWith("customer@example.com");
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await getPublicInvitation(created.token)).toMatchObject({ valid: true, suggestedName: "Tumi" });
  });

  it("does not issue public review access for incomplete, reviewed or rate-limited orders", async () => {
    mocks.hashes.get("orders:completed")?.clear();
    await expect(createReviewInvitationForEmail("customer@example.com", "127.0.0.1")).rejects.toThrow("completed Smelt order");
    mocks.hashes.set("orders:completed", new Map([["order-1", "done"]]));
    const { token } = await invitation();
    await submitReview(token, { rating: 5, body: "Already reviewed.", displayName: "Tumi", photoUrls: [], consent: true });
    await expect(createReviewInvitationForEmail("customer@example.com", "127.0.0.1")).rejects.toThrow("already been submitted");
    mocks.db.eval.mockResolvedValueOnce(0);
    await expect(createReviewInvitationForEmail("another@example.com", "127.0.0.1")).rejects.toThrow("Too many attempts");
  });

  it("protects the public email lookup by origin and returns only an opaque review URL", async () => {
    const crossOrigin = new Request("https://saunahat.co.za/api/reviews/access", {
      method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ email: "customer@example.com" }),
    });
    expect((await reviewAccessPOST(crossOrigin)).status).toBe(403);
    expect(mocks.paidOrdersByEmail).not.toHaveBeenCalled();

    const request = new Request("https://saunahat.co.za/api/reviews/access", {
      method: "POST", headers: { origin: "https://saunahat.co.za", "content-type": "application/json" }, body: JSON.stringify({ email: "customer@example.com" }),
    });
    const response = await reviewAccessPOST(request);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ reviewUrl: expect.stringMatching(/^\/review\/[A-Za-z0-9_-]{43}$/) });
  });

  it("requires a completed Paystack order and invalidates replaced invitations", async () => {
    mocks.hashes.get("orders:completed")?.clear();
    await expect(createReviewInvitation("order-1")).rejects.toThrow("Mark this order complete");
    mocks.hashes.set("orders:completed", new Map([["order-1", "done"]]));
    const first = await createReviewInvitation("order-1");
    const second = await createReviewInvitation("order-1");
    expect((await getPublicInvitation(first.token)).valid).toBe(false);
    expect((await getPublicInvitation(second.token)).valid).toBe(true);
  });

  it("rechecks Paystack and atomically prevents token reuse", async () => {
    const { token } = await invitation();
    await expect(submitReview(token, { rating: 5, body: "Love the fit.", displayName: "Tumi", anonymous: false, photoUrls: [], consent: true })).resolves.toMatchObject({ status: "pending" });
    expect(mocks.paidOrder).toHaveBeenCalledTimes(2);
    await expect(submitReview(token, { rating: 5, body: "Again", displayName: "Tumi", consent: true })).rejects.toThrow("already been used");
    expect((await getPublicInvitation(token)).used).toBe(true);
  });

  it("does not accept the verified label when Paystack no longer confirms the order", async () => {
    const { token } = await invitation();
    mocks.paidOrder.mockRejectedValueOnce(new Error("payment reversed"));
    await expect(submitReview(token, { rating: 4, body: "Good hat", displayName: "Tumi", photoUrls: [], consent: true })).rejects.toThrow("payment reversed");
  });
});

describe("review photos and moderation", () => {
  it("enables photo uploads for a Blob store connected with OIDC", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_test");
    vi.stubEnv("BLOB_WEBHOOK_PUBLIC_KEY", "public-key");
    const { visible } = await invitation();
    expect(visible).toMatchObject({ photoUploadsEnabled: true, photoUploadMode: "presigned" });
  });

  it("accepts only invitation-scoped Blob photos and caps upload authorization at three", async () => {
    const { token, visible } = await invitation();
    const pathname = `reviews/pending/${visible.uploadKey}/photo.webp`;
    const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
    expect(photoFromInvitation(url, visible.uploadKey!)).toMatchObject({ pathname });
    expect(photoFromInvitation(
      `https://store.public.blob.vercel-storage.com/${pathname}-providerSuffix`,
      visible.uploadKey!,
    )).toMatchObject({ pathname: `${pathname}-providerSuffix` });
    expect(photoFromInvitation(
      `https://store.public.blob.vercel-storage.com/reviews/pending/${visible.uploadKey}/photo-providerSuffix.webp`,
      visible.uploadKey!,
    )).toMatchObject({ pathname: `reviews/pending/${visible.uploadKey}/photo-providerSuffix.webp` });
    expect(photoFromInvitation("https://evil.example/photo.webp", visible.uploadKey!)).toBeNull();
    expect(photoFromInvitation(
      `https://store.public.blob.vercel-storage.com/reviews/pending/${visible.uploadKey}/photo.svg`,
      visible.uploadKey!,
    )).toBeNull();
    expect(photoFromInvitation(
      `https://store.public.blob.vercel-storage.com/reviews/pending/${visible.uploadKey}/nested/photo.webp`,
      visible.uploadKey!,
    )).toBeNull();
    await expect(reservePhotoUpload(token, pathname)).resolves.toBe(visible.uploadKey);
    await reservePhotoUpload(token, pathname); await reservePhotoUpload(token, pathname);
    await reservePhotoUpload(token, pathname.replace("photo.webp", "second.webp"));
    await reservePhotoUpload(token, pathname.replace("photo.webp", "third.webp"));
    await expect(reservePhotoUpload(token, pathname.replace("photo.webp", "fourth.webp"))).rejects.toThrow("three photo uploads");
    await expect(reservePhotoUpload(token, pathname)).resolves.toBe(visible.uploadKey);
  });

  it("accepts private Blob photos and only exposes them after approval or to an admin", async () => {
    const { token, visible } = await invitation();
    const url = `https://store_example.private.blob.vercel-storage.com/reviews/pending/${visible.uploadKey}/photo.webp`;
    expect(photoFromInvitation(url, visible.uploadKey!)).not.toBeNull();
    expect(photoFromInvitation(url, "different-invitation")).toBeNull();
    expect(photoFromInvitation(url.replace(".com/", ".com.evil.example/"), visible.uploadKey!)).toBeNull();
    const submitted = await submitReview(token, { rating: 5, body: "Great hat", displayName: "Tumi", photoUrls: [url], consent: true });
    expect(await getReviewPhoto(submitted.id, 0)).toBeNull();
    expect(await getReviewPhoto(submitted.id, 0, true)).toMatchObject({ url });
    await moderateReview(submitted.id, "published");
    expect(await getReviewPhoto(submitted.id, 0)).toMatchObject({ url });
    expect((await listPublishedReviews()).reviews[0].photos[0].url).toBe(`/api/reviews/photos/${submitted.id}/0`);
    await moderateReview(submitted.id, "rejected");
    expect(await getReviewPhoto(submitted.id, 0)).toBeNull();
  });

  it("authorizes and submits invitation-scoped JPEG fallback photos", async () => {
    const { token, visible } = await invitation();
    const pathname = `reviews/pending/${visible.uploadKey}/photo.jpg`;
    const url = `https://store_example.private.blob.vercel-storage.com/${pathname}`;
    await expect(reservePhotoUpload(token, pathname)).resolves.toBe(visible.uploadKey);
    expect(photoFromInvitation(url, visible.uploadKey!)).toMatchObject({ pathname });
    expect(photoFromInvitation(url, "another-invitation")).toBeNull();
    await expect(reservePhotoUpload(token, pathname.replace("photo.jpg", "nested/photo.jpg"))).rejects.toThrow("Invalid photo path");
    const submitted = await submitReview(token, { rating: 5, body: "Great hat", displayName: "Tumi", photoUrls: [url], consent: true });
    expect(await getReviewPhoto(submitted.id, 0, true)).toMatchObject({ url, pathname });
  });

  it("publishes approved reviews, calculates aggregates and deletes rejected media", async () => {
    const { token, visible } = await invitation();
    const url = `https://store.public.blob.vercel-storage.com/reviews/pending/${visible.uploadKey}/photo.webp`;
    const submitted = await submitReview(token, { rating: 5, body: "Warm head, longer session.", displayName: "Tumi", anonymous: false, photoUrls: [url], consent: true });
    expect((await listPublishedReviews()).summary.total).toBe(0);
    await moderateReview(submitted.id, "published");
    const published = await listPublishedReviews();
    expect(published.summary).toMatchObject({ total: 1, average: 5, distribution: { 5: 1 } });
    expect(published.reviews[0]).not.toHaveProperty("customerEmail");
    expect(published.reviews[0]).not.toHaveProperty("orderReference");
    await moderateReview(submitted.id, "rejected");
    expect(mocks.blobDelete).toHaveBeenCalledWith([url]);
    expect((await listPublishedReviews()).summary.total).toBe(0);
  });
});

describe("review validation and aggregate calculations", () => {
  it("rejects missing consent, invalid ratings and too many photos", () => {
    expect(() => validateReviewSubmission({ rating: 0, body: "Great", displayName: "Tumi", consent: true })).toThrow("rating");
    expect(() => validateReviewSubmission({ rating: 5, body: "Great", displayName: "Tumi", consent: false })).toThrow("confirm");
    expect(() => validateReviewSubmission({ rating: 5, body: "Great", displayName: "Tumi", consent: true, photoUrls: ["1", "2", "3", "4"] })).toThrow("no more than 3");
  });

  it("calculates an honest one-decimal average and rating distribution", () => {
    const base: Omit<PublicReview, "rating"> = { id: "1", displayName: "A", body: "Good", colours: ["green"], photos: [], verifiedPurchase: true, publishedAt: "2026-09-17T00:00:00.000Z" };
    const reviews: PublicReview[] = [{ ...base, rating: 5 }, { ...base, id: "2", rating: 4 }, { ...base, id: "3", rating: 4 }];
    expect(reviewSummary(reviews)).toEqual({ total: 3, average: 4.3, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } });
  });
});
