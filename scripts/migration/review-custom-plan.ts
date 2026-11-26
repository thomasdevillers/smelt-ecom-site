import { sha256, type Snapshot } from "./baseline";
import type { ReviewCustomSource } from "./review-custom-source";
import type { ReviewRecord } from "../../lib/reviews";
import type { ReviewRanking } from "../../lib/reviewRanking";
import type { CustomHatSubmission } from "../../lib/customHats/shared";

export type ImportTable =
  | "reviews"
  | "review_invitations"
  | "review_claims"
  | "review_uploads"
  | "review_rankings"
  | "custom_requests"
  | "custom_revisions"
  | "custom_files";
export interface ImportEntry {
  id: string;
  sourceHash: string;
  table: ImportTable;
  environment: "live" | "test";
  sourceKeys: string[];
  key: Record<string, string | number>;
  values: Record<string, unknown>;
  orderReference?: string;
}
export interface ImportPlan {
  version: 1;
  archiveChecksum: string;
  capturedAt: string;
  digest: string;
  entries: ImportEntry[];
  sources: {
    key: string;
    checksum: string | null;
    decision: "mapped" | "rebuilt-index" | "retain-redis" | "excluded-approved" | "quarantined";
  }[];
  rejected: { key: string; field?: string; reason: string }[];
  excluded: { key: string; field?: string; reason: string }[];
  resolution: PublishedOnlyResolution | null;
}

export interface PublishedOnlyResolution {
  archiveChecksum: string;
  environment: "live" | "test";
  orderDigest: string;
  publishedId: string;
  rejectedIds: string[];
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const decode = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
function object(value: unknown): Record<string, unknown> {
  const result = decode(value);
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("invalid-object");
  return result as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("invalid-string");
  return value;
}
function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("invalid-timestamp");
  return result;
}
function expiry(row: Snapshot) {
  if (row.expiresAt === null) return null;
  return date(row.expiresAt);
}
function pairs(row: Snapshot, type = "hash"): [string, unknown][] {
  if (row.type !== type || !Array.isArray(row.logical)) throw new Error("invalid-source-type");
  const seen = new Set<string>();
  return row.logical.map((pair) => {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      seen.has(pair[0])
    )
      throw new Error("invalid-source-entry");
    seen.add(pair[0]);
    return [pair[0], pair[1]];
  });
}
function scalar(row: Snapshot) {
  if (row.type !== "string") throw new Error("invalid-source-type");
  return decode(row.logical);
}
function validateReview(raw: unknown, id: string): ReviewRecord {
  const r = object(raw);
  if (
    r.id !== id ||
    r.productId !== "smelt-sauna-hat" ||
    r.verifiedPurchase !== true ||
    typeof r.anonymous !== "boolean" ||
    typeof r.displayName !== "string" ||
    typeof r.body !== "string" ||
    !Number.isInteger(r.rating) ||
    Number(r.rating) < 1 ||
    Number(r.rating) > 5 ||
    !["pending", "published", "rejected"].includes(String(r.status)) ||
    !Array.isArray(r.colours) ||
    !r.colours.every((c) => c === "green" || c === "cream") ||
    !Array.isArray(r.photos)
  )
    throw new Error("invalid-review-record");
  string(r.orderReference);
  // A historically blank email is preserved, not invented or used to infer an
  // order relationship. The review's original reference remains authoritative.
  if (typeof r.customerEmail !== "string") throw new Error("invalid-customer-email");
  string(r.consentVersion);
  date(r.submittedAt);
  if (r.publishedAt !== null) date(r.publishedAt);
  if (r.status === "published" && !r.publishedAt) throw new Error("missing-publication-timestamp");
  for (const rawPhoto of r.photos) {
    const photo = object(rawPhoto);
    const url = new URL(string(photo.url));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !/^[a-z0-9_-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i.test(url.hostname)
    )
      throw new Error("invalid-blob-reference");
    if (decodeURIComponent(url.pathname.slice(1)) !== string(photo.pathname))
      throw new Error("photo-path-mismatch");
  }
  return r as unknown as ReviewRecord;
}
function submission(raw: unknown, owned: Set<string>): CustomHatSubmission | null {
  if (raw === null) return null;
  const s = object(raw),
    contact = object(s.contact);
  for (const field of ["name", "company", "email", "phone"])
    if (typeof contact[field] !== "string") throw new Error("invalid-submission-contact");
  if (typeof s.notes !== "string" || !Array.isArray(s.hats) || !s.hats.length)
    throw new Error("invalid-submission");
  for (const rawHat of s.hats) {
    const hat = object(rawHat);
    string(hat.id);
    if (
      !Number.isInteger(hat.quantity) ||
      Number(hat.quantity) < 1 ||
      typeof hat.colour !== "string" ||
      typeof hat.notes !== "string"
    )
      throw new Error("invalid-design");
    const tag = object(hat.tag);
    if (typeof tag.enabled !== "boolean" || typeof tag.text !== "string")
      throw new Error("invalid-tag");
    for (const side of [hat.front, hat.back]) {
      const p = object(side);
      if (
        typeof p.enabled !== "boolean" ||
        typeof p.notes !== "string" ||
        ![p.fileKey, p.fileName, p.fileType].every((v) => v === null || typeof v === "string")
      )
        throw new Error("invalid-placement");
      if (p.fileKey && !owned.has(String(p.fileKey))) throw new Error("missing-file-ownership");
    }
  }
  return s as unknown as CustomHatSubmission;
}

/** Explicit CLI approval is restricted to the single three-record conflict the
 * owner reviewed: exactly one published and two rejected, in this exact archive.
 * It is not a general policy for arbitrarily choosing among future duplicates. */
export function singlePublishedOnlyResolution(source: ReviewCustomSource): PublishedOnlyResolution {
  const conflicts: PublishedOnlyResolution[] = [];
  for (const environment of ["live", "test"] as const) {
    const records = source.snapshots.find(
      (row) => row.key === `smelt:reviews:v1:${environment}:records`,
    );
    if (!records) continue;
    if (records.unstable) throw new Error("Unstable review records need recapture.");
    const groups = new Map<string, ReviewRecord[]>();
    for (const [id, raw] of pairs(records)) {
      const review = validateReview(raw, id),
        group = groups.get(review.orderReference) ?? [];
      group.push(review);
      groups.set(review.orderReference, group);
    }
    for (const [reference, group] of groups) {
      if (group.length < 2) continue;
      const published = group.filter((review) => review.status === "published"),
        rejected = group.filter((review) => review.status === "rejected");
      if (group.length !== 3 || published.length !== 1 || rejected.length !== 2)
        throw new Error(
          "Duplicate group differs from the approved one-published/two-rejected case.",
        );
      conflicts.push({
        archiveChecksum: source.archiveChecksum,
        environment,
        orderDigest: sha256(reference),
        publishedId: published[0].id,
        rejectedIds: rejected.map((review) => review.id).sort(),
      });
    }
  }
  if (conflicts.length !== 1)
    throw new Error("Approval requires exactly one three-review conflict.");
  return conflicts[0];
}

/** Deterministic plan from a fully authenticated archive. Never rewrites URLs,
 * calls providers, invents timestamps, or reissues a relative TTL. */
export function planReviewCustomImport(
  source: ReviewCustomSource,
  resolution: PublishedOnlyResolution | null = null,
): ImportPlan {
  const rows = new Map(source.snapshots.map((row) => [row.key, row]));
  const entries = new Map<string, ImportEntry>();
  const rejected: ImportPlan["rejected"] = [];
  const excluded: ImportPlan["excluded"] = [];
  let resolutionUsed = false;
  const decisions = new Map<string, ImportPlan["sources"][number]["decision"]>();
  const fail = (key: string, reason: string, field?: string) => {
    rejected.push({ key, field, reason });
    decisions.set(key, "quarantined");
  };
  const attempt = (row: Snapshot, fn: () => void, field?: string) => {
    try {
      if (row.unstable) throw new Error("unstable-source");
      expiry(row);
      fn();
    } catch (error) {
      fail(
        row.key,
        error instanceof Error && /^[a-z-]+$/.test(error.message)
          ? error.message
          : "invalid-record",
        field,
      );
    }
  };
  function add(
    table: ImportTable,
    environment: "live" | "test",
    key: ImportEntry["key"],
    values: ImportEntry["values"],
    sources: Snapshot[],
    orderReference?: string,
  ) {
    const id = sha256(canonical({ table, environment, key }));
    // Fingerprint this entity, not its entire containing Redis hash. Another
    // review changing in a newer capture must not invalidate this checkpoint.
    const value = { table, environment, key, values, orderReference: orderReference ?? null };
    const entry = {
      id,
      table,
      environment,
      key,
      values,
      orderReference,
      sourceKeys: sources.map((r) => r.key).sort(),
      sourceHash: sha256(canonical(value)),
    };
    if (entries.has(id) && entries.get(id)!.sourceHash !== entry.sourceHash)
      throw new Error("conflicting-target-ownership");
    entries.set(id, entry);
  }
  for (const row of source.snapshots) {
    if (/^smelt:reviews:v1:(live|test):(?:access-rate:|ranking:lock:)/.test(row.key)) {
      decisions.set(row.key, "retain-redis");
      continue;
    }
    if (!/^smelt:(reviews|custom-hats):v1:(live|test):/.test(row.key))
      fail(row.key, "unknown-namespace");
  }
  for (const environment of ["live", "test"] as const) {
    const rp = `smelt:reviews:v1:${environment}:`,
      cp = `smelt:custom-hats:v1:${environment}:`;
    const reviews = new Map<string, ReviewRecord>(),
      observedReviews = new Map<string, ReviewRecord>();
    const excludedReviews = new Set<string>();
    const records = rows.get(`${rp}records`);
    if (records)
      attempt(records, () => {
        for (const [id, raw] of pairs(records))
          attempt(
            records,
            () => {
              const review = validateReview(raw, id);
              observedReviews.set(id, review);
            },
            id,
          );
        const orders = new Map<string, number>();
        for (const review of observedReviews.values())
          orders.set(review.orderReference, (orders.get(review.orderReference) ?? 0) + 1);
        if (resolution?.environment === environment) {
          const group = [...observedReviews.values()].filter(
            (review) => sha256(review.orderReference) === resolution.orderDigest,
          );
          const published = group.filter((review) => review.status === "published"),
            rejectedGroup = group.filter((review) => review.status === "rejected");
          if (
            resolution.archiveChecksum === source.archiveChecksum &&
            group.length === 3 &&
            published.length === 1 &&
            published[0].id === resolution.publishedId &&
            rejectedGroup.length === 2 &&
            canonical(rejectedGroup.map((review) => review.id).sort()) ===
              canonical(resolution.rejectedIds.slice().sort())
          ) {
            for (const review of rejectedGroup) excludedReviews.add(review.id);
            resolutionUsed = true;
          } else fail(records.key, "approved-resolution-no-longer-matches");
        }
        for (const [id, review] of observedReviews)
          attempt(
            records,
            () => {
              if (excludedReviews.has(id)) {
                excluded.push({
                  key: records.key,
                  field: id,
                  reason: "owner-approved-rejected-duplicate",
                });
                return;
              }
              if (
                orders.get(review.orderReference)! > 1 &&
                !(
                  resolutionUsed &&
                  resolution?.environment === environment &&
                  id === resolution.publishedId
                )
              )
                throw new Error("duplicate-review-order");
              reviews.set(id, review);
              add(
                "reviews",
                environment,
                { id },
                {
                  id,
                  order_reference: review.orderReference,
                  status: review.status,
                  rating: review.rating,
                  record: review,
                  submitted_at: review.submittedAt,
                  published_at: review.publishedAt,
                },
                [records],
                review.orderReference,
              );
            },
            id,
          );
        if (decisions.get(records.key) !== "quarantined") decisions.set(records.key, "mapped");
      });
    const invitations = new Map<string, { reference: string; row: Snapshot }>();
    for (const row of source.snapshots.filter((r) => r.key.startsWith(`${rp}invite:`)))
      attempt(row, () => {
        const tokenDigest = row.key.slice(`${rp}invite:`.length);
        if (!/^[a-f0-9]{64}$/.test(tokenDigest)) throw new Error("invalid-token-digest");
        const invite = object(scalar(row));
        const reference = string(invite.reference);
        string(invite.email);
        string(invite.uploadKey);
        date(invite.createdAt);
        date(invite.expiresAt);
        if (
          typeof invite.suggestedName !== "string" ||
          !Array.isArray(invite.colours) ||
          !invite.colours.every((c) => c === "green" || c === "cream") ||
          (invite.photosRequired !== undefined && typeof invite.photosRequired !== "boolean")
        )
          throw new Error("invalid-invitation");
        const pointer = rows.get(`${rp}order:${sha256(reference)}:invite`);
        const current = pointer && !pointer.unstable && scalar(pointer) === tokenDigest;
        const claim = rows.get(`${rp}claim:${tokenDigest}`);
        const deadline = Math.min(
          Date.parse(String(invite.expiresAt)),
          row.expiresAt ? Date.parse(row.expiresAt) : Infinity,
          current && pointer.expiresAt ? Date.parse(date(pointer.expiresAt)) : Infinity,
        );
        if (deadline < Date.parse(String(invite.createdAt)))
          throw new Error("invalid-invitation-deadline");
        // A claim must not make a replaced link current again. Claims independently
        // retain used evidence, including owner-approved omitted-review claims.
        const state = !current
          ? "revoked"
          : claim
            ? "used"
            : deadline <= Date.parse(source.capturedAt)
              ? "expired"
              : "active";
        add(
          "review_invitations",
          environment,
          { token_digest: tokenDigest },
          {
            token_digest: tokenDigest,
            order_reference: reference,
            state,
            payload: invite,
            created_at: invite.createdAt,
            expires_at: new Date(deadline).toISOString(),
          },
          [row, ...(pointer ? [pointer] : []), ...(claim ? [claim] : [])],
          reference,
        );
        invitations.set(tokenDigest, { reference, row });
        decisions.set(row.key, "mapped");
      });
    for (const row of source.snapshots.filter((r) => r.key.startsWith(`${rp}claim:`)))
      attempt(row, () => {
        const tokenDigest = row.key.slice(`${rp}claim:`.length),
          reviewId = string(scalar(row));
        if (excludedReviews.has(reviewId)) {
          const original = observedReviews.get(reviewId)!,
            invitation = invitations.get(tokenDigest);
          if (!invitation || invitation.reference !== original.orderReference)
            throw new Error("orphan-or-conflicting-claim");
          excluded.push({ key: row.key, reason: "owner-approved-excluded-review-claim" });
          decisions.set(row.key, "excluded-approved");
          return;
        }
        const invitation = invitations.get(tokenDigest),
          review = reviews.get(reviewId);
        if (!invitation || !review || invitation.reference !== review.orderReference)
          throw new Error("orphan-or-conflicting-claim");
        add(
          "review_claims",
          environment,
          { token_digest: tokenDigest },
          {
            token_digest: tokenDigest,
            order_reference: invitation.reference,
            review_id: reviewId,
            claimed_at: null,
            expires_at: row.expiresAt,
            payload: { originalValue: row.logical },
          },
          [row, invitation.row],
          invitation.reference,
        );
        decisions.set(row.key, "mapped");
      });
    for (const row of source.snapshots.filter((r) => r.key.startsWith(`${rp}order:`)))
      attempt(row, () => {
        const match = /^order:([a-f0-9]{64}):(invite|review)$/.exec(row.key.slice(rp.length));
        if (!match) throw new Error("unknown-order-index");
        const value = string(scalar(row));
        if (match[2] === "invite") {
          const invitation = invitations.get(value);
          if (!invitation || sha256(invitation.reference) !== match[1])
            throw new Error("orphan-invitation-pointer");
        } else {
          // The index is rebuilt from the retained published review. A source
          // pointer to an excluded rejected duplicate must not revive that record.
          const review =
            reviews.get(value) ??
            (excludedReviews.has(value) ? observedReviews.get(value) : undefined);
          if (!review || sha256(review.orderReference) !== match[1])
            throw new Error("orphan-order-claim");
        }
        decisions.set(row.key, "rebuilt-index");
      });
    for (const row of source.snapshots.filter((r) => r.key.startsWith(`${rp}status:`)))
      attempt(row, () => {
        const status = row.key.slice(`${rp}status:`.length);
        if (!["pending", "published", "rejected"].includes(status))
          throw new Error("unknown-status-index");
        const indexed = pairs(row, "zset");
        if (
          indexed.length !==
            [...observedReviews.values()].filter((r) => r.status === status).length ||
          indexed.some(([id]) => observedReviews.get(id)?.status !== status)
        )
          throw new Error("status-index-drift");
        decisions.set(row.key, "rebuilt-index");
      });
    for (const row of source.snapshots.filter((r) => r.key.startsWith(`${rp}upload-paths:`)))
      attempt(row, () => {
        const tokenDigest = row.key.slice(`${rp}upload-paths:`.length),
          invitation = invitations.get(tokenDigest);
        if (!invitation) throw new Error("orphan-upload-ownership");
        const invite = object(scalar(invitation.row));
        for (const [pathname, member] of pairs(row, "set")) {
          if (member !== true || !pathname.startsWith(`reviews/pending/${invite.uploadKey}/`))
            throw new Error("invalid-upload-ownership");
          add(
            "review_uploads",
            environment,
            { pathname },
            {
              pathname,
              token_digest: tokenDigest,
              expires_at: row.expiresAt,
              url: null,
              review_id: null,
            },
            [row, invitation.row],
          );
        }
        decisions.set(row.key, "mapped");
      });
    const rankingRows = source.snapshots.filter(
      (r) => r.key === `${rp}ranking:scores` || r.key.startsWith(`${rp}ranking:retry:`),
    );
    const rankings = new Map<
      string,
      { result: ReviewRanking | null; retry: Record<string, unknown> | null; rows: Snapshot[] }
    >();
    for (const row of rankingRows)
      attempt(row, () => {
        const values = row.key.endsWith(":scores")
          ? pairs(row)
          : [[row.key.slice(`${rp}ranking:retry:`.length), scalar(row)] as [string, unknown]];
        for (const [reviewId, raw] of values)
          attempt(
            row,
            () => {
              if (excludedReviews.has(reviewId)) {
                excluded.push({
                  key: row.key,
                  field: row.key.endsWith(":scores") ? reviewId : undefined,
                  reason: "owner-approved-excluded-review-ranking",
                });
                if (!row.key.endsWith(":scores")) decisions.set(row.key, "excluded-approved");
                return;
              }
              if (!reviews.has(reviewId)) throw new Error("orphan-ranking");
              const value = object(raw),
                current = rankings.get(reviewId) ?? { result: null, retry: null, rows: [] };
              if (row.key.endsWith(":scores")) {
                for (const field of [
                  "usefulness",
                  "specificity",
                  "context",
                  "clarity",
                  "imageEvidence",
                ])
                  if (
                    !Number.isInteger(value[field]) ||
                    Number(value[field]) < 0 ||
                    Number(value[field]) > 10
                  )
                    throw new Error("invalid-ranking-score");
                if (typeof value.score !== "number" || !Number.isFinite(value.score))
                  throw new Error("invalid-ranking-score");
                for (const field of ["fingerprint", "rubricVersion", "model", "reason"])
                  string(value[field]);
                date(value.scoredAt);
                current.result = value as unknown as ReviewRanking;
              } else {
                string(value.fingerprint);
                if (
                  !Number.isInteger(value.attempts) ||
                  Number(value.attempts) < 0 ||
                  typeof value.nextAttemptAt !== "number" ||
                  !Number.isFinite(value.nextAttemptAt)
                )
                  throw new Error("invalid-ranking-retry");
                current.retry = { ...value, sourceExpiresAt: row.expiresAt };
              }
              current.rows.push(row);
              rankings.set(reviewId, current);
            },
            reviewId,
          );
        if (!["quarantined", "excluded-approved"].includes(decisions.get(row.key) ?? ""))
          decisions.set(row.key, "mapped");
      });
    for (const [reviewId, ranking] of rankings)
      add(
        "review_rankings",
        environment,
        { review_id: reviewId },
        { review_id: reviewId, result: ranking.result, retry_state: ranking.retry },
        ranking.rows,
      );

    const requests = rows.get(`${cp}requests`);
    if (requests)
      attempt(requests, () => {
        for (const [id, raw] of pairs(requests))
          attempt(
            requests,
            () => {
              const request = object(raw),
                token = string(request.token),
                customer = object(request.customer);
              if (
                Object.keys(request).some(
                  (key) =>
                    ![
                      "id",
                      "token",
                      "customer",
                      "createdAt",
                      "submittedAt",
                      "revision",
                      "submission",
                    ].includes(key),
                )
              )
                throw new Error("unknown-custom-request-field");
              if (
                request.id !== id ||
                !/^[A-Za-z0-9_-]{32,64}$/.test(token) ||
                !Number.isInteger(request.revision) ||
                Number(request.revision) < 0
              )
                throw new Error("invalid-custom-request");
              for (const field of ["name", "email", "phone"])
                if (typeof customer[field] !== "string") throw new Error("invalid-custom-contact");
              date(request.createdAt);
              if (request.submittedAt !== null) date(request.submittedAt);
              const tokenRow = rows.get(`${cp}token:${sha256(token)}`),
                files = rows.get(`${cp}files:${id}`);
              if (!tokenRow || tokenRow.unstable || scalar(tokenRow) !== id)
                throw new Error("missing-or-conflicting-custom-token");
              if (files?.unstable) throw new Error("unstable-file-ownership");
              if (files) expiry(files);
              const fileEntries = files ? pairs(files, "set") : [];
              const owned = new Set(
                fileEntries.map(([key, member]) => {
                  if (member !== true || !key.startsWith(`custom-hats/${environment}/${id}/`))
                    throw new Error("invalid-r2-ownership");
                  return key;
                }),
              );
              const design = submission(request.submission, owned);
              if (
                (design !== null) !==
                (Number(request.revision) > 0 && request.submittedAt !== null)
              )
                throw new Error("invalid-revision-history");
              const sources = [requests, tokenRow, ...(files ? [files] : [])];
              const dates = [requests.expiresAt, tokenRow.expiresAt]
                .filter((v): v is string => v !== null)
                .map((v) => Date.parse(date(v)));
              add(
                "custom_requests",
                environment,
                { id },
                {
                  id,
                  token_digest: sha256(token),
                  token,
                  payload: customer,
                  created_at: request.createdAt,
                  submitted_at: request.submittedAt,
                  revision: request.revision,
                  expires_at: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
                },
                sources,
              );
              if (design)
                add(
                  "custom_revisions",
                  environment,
                  { request_id: id, revision: Number(request.revision) },
                  {
                    request_id: id,
                    revision: request.revision,
                    submission: design,
                    submitted_at: request.submittedAt,
                  },
                  sources,
                );
              for (const fileKey of owned)
                add(
                  "custom_files",
                  environment,
                  { file_key: fileKey },
                  {
                    file_key: fileKey,
                    request_id: id,
                    expires_at: files!.expiresAt,
                    metadata: null,
                  },
                  sources,
                );
              decisions.set(tokenRow.key, "mapped");
              if (files) decisions.set(files.key, "mapped");
            },
            id,
          );
        if (decisions.get(requests.key) !== "quarantined") decisions.set(requests.key, "mapped");
      });
    for (const row of source.snapshots.filter(
      (r) => r.key.startsWith(`${cp}files:`) || r.key.startsWith(`${cp}token:`),
    )) {
      if (!decisions.has(row.key)) fail(row.key, "orphan-custom-ownership");
    }
  }
  for (const row of source.snapshots)
    if (!decisions.has(row.key)) fail(row.key, "unknown-source-suffix");
  if (resolution && !resolutionUsed)
    rejected.push({ key: "approved-resolution", reason: "approved-resolution-not-found" });
  // Stable dependency order; each entity becomes a durable resume checkpoint.
  const order: ImportTable[] = [
    "reviews",
    "review_invitations",
    "review_claims",
    "review_uploads",
    "review_rankings",
    "custom_requests",
    "custom_revisions",
    "custom_files",
  ];
  const sorted = [...entries.values()].sort(
    (a, b) => order.indexOf(a.table) - order.indexOf(b.table) || a.id.localeCompare(b.id),
  );
  const sources = source.snapshots
    .map((row) => ({ key: row.key, checksum: row.checksum, decision: decisions.get(row.key)! }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const content = {
    version: 1 as const,
    archiveChecksum: source.archiveChecksum,
    capturedAt: source.capturedAt,
    entries: sorted,
    sources,
    rejected,
    excluded,
    resolution,
  };
  return { ...content, digest: sha256(canonical(content)) };
}
