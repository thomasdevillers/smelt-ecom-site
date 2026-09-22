import type { Colour } from "./product";

export const REVIEW_PRODUCT_ID = "smelt-sauna-hat";
export const REVIEW_INVITATION_DAYS = 90;
export const REVIEW_MAX_PHOTOS = 3;
export const REVIEW_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const REVIEW_UPLOAD_PHOTO_TYPES = ["image/webp", "image/jpeg"];

export type ReviewStatus = "pending" | "published" | "rejected";

export interface ReviewPhoto {
  url: string;
  pathname: string;
}

export interface ReviewRecord {
  id: string;
  productId: typeof REVIEW_PRODUCT_ID;
  orderReference: string;
  customerEmail: string;
  displayName: string;
  anonymous: boolean;
  rating: number;
  body: string;
  colours: Colour[];
  photos: ReviewPhoto[];
  verifiedPurchase: true;
  incentivized?: boolean;
  status: ReviewStatus;
  submittedAt: string;
  publishedAt: string | null;
  consentVersion: "2026-09-17";
}

export interface PublicReview {
  id: string;
  displayName: string;
  rating: number;
  body: string;
  colours: Colour[];
  photos: ReviewPhoto[];
  verifiedPurchase: true;
  incentivized?: boolean;
  publishedAt: string;
}

export interface ReviewSummary {
  total: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ReviewSubmission {
  rating: number;
  body: string;
  displayName: string;
  anonymous: boolean;
  photoUrls: string[];
  consent: true;
}

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function validateReviewSubmission(input: unknown): ReviewSubmission {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const rating = Number(value.rating);
  const body = clean(value.body);
  const anonymous = value.anonymous === true;
  const displayName = clean(value.displayName);
  const photoUrls = Array.isArray(value.photoUrls)
    ? value.photoUrls.map(clean).filter(Boolean)
    : [];

  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5)
    throw new Error("Choose a rating from one to five stars.");
  if (body.length < 3 || body.length > 1600)
    throw new Error("Your review must be between 3 and 1,600 characters.");
  if (!anonymous && (displayName.length < 1 || displayName.length > 60))
    throw new Error("Add a display name of no more than 60 characters, or choose anonymous.");
  if (photoUrls.length > REVIEW_MAX_PHOTOS || new Set(photoUrls).size !== photoUrls.length)
    throw new Error(`Add no more than ${REVIEW_MAX_PHOTOS} different photos.`);
  if (value.consent !== true)
    throw new Error("Please confirm that we may publish your review and photos.");

  return { rating, body, displayName, anonymous, photoUrls, consent: true };
}

export function photoFromInvitation(url: string, uploadKey: string): ReviewPhoto | null {
  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
      !/^[a-z0-9_-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return null;
    const filename = pathname.slice(`reviews/pending/${uploadKey}/`.length);
    const isPhotoPath = /^[^/]+\.(?:webp|jpg)(?:-[A-Za-z0-9_-]+)?$/i.test(filename);
    if (!pathname.startsWith(`reviews/pending/${uploadKey}/`) || !isPhotoPath) return null;
    return { url: parsed.toString(), pathname };
  } catch {
    return null;
  }
}

export function reviewPhotoUrl(reviewId: string, index: number): string {
  return `/api/reviews/photos/${encodeURIComponent(reviewId)}/${index}`;
}

export function publicReview(review: ReviewRecord): PublicReview | null {
  if (review.status !== "published" || !review.publishedAt) return null;
  return {
    id: review.id,
    displayName: review.anonymous ? "Anonymous" : review.displayName,
    rating: review.rating,
    body: review.body,
    colours: review.colours,
    photos: review.photos.map((photo, index) => ({ ...photo, url: reviewPhotoUrl(review.id, index) })),
    verifiedPurchase: true,
    incentivized: review.incentivized === true,
    publishedAt: review.publishedAt,
  };
}

export function reviewSummary(reviews: PublicReview[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) distribution[review.rating as 1 | 2 | 3 | 4 | 5]++;
  const average = reviews.length
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
    : 0;
  return { total: reviews.length, average, distribution };
}
