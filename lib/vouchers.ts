import { randomBytes } from "node:crypto";
import { AdminError, adminStore, digest } from "./admin/store";

export const REVIEW_VOUCHER_AMOUNT = 50;
export const REVIEW_VOUCHER_DAYS = 90;

const mode = () => process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
const prefix = () => `smelt:vouchers:v1:${mode()}`;
const voucherKey = (id: string) => `${prefix()}:code:${id}`;
const reservationKey = (reference: string) => `${prefix()}:reservation:${digest(reference)}`;
export const rewardKey = (reviewId: string) => `${prefix()}:reward:${reviewId}`;
export const rewardQueueKey = () => `${prefix()}:reward-queue`;

export interface VoucherMetadata { id: string; amount: number }
export interface VoucherReward { code: string; amount: number; expiresAt: string }
type StoredReward = VoucherReward & { reviewId: string; email: string; createdAt: string };
type VoucherRecord = {
  reviewId: string;
  email: string;
  amount: number;
  issuedAt: string;
  expiresAt: string;
  heldBy: string | null;
  heldAt: string | null;
  redeemedBy: string | null;
  redeemedAt: string | null;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizeVoucherCode = (value: unknown) => typeof value === "string"
  ? value.trim().toUpperCase().replace(/\s+/g, "")
  : "";

function parseStored<T>(value: T | string | null): T | null {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function createReviewVoucher(email: string, reviewId: string, now = new Date()) {
  const code = `SMELT-${randomBytes(9).toString("base64url").toUpperCase()}`;
  const id = digest(code);
  const expiresAt = new Date(now.getTime() + REVIEW_VOUCHER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const record: VoucherRecord = {
    reviewId,
    email: normalizeEmail(email),
    amount: REVIEW_VOUCHER_AMOUNT,
    issuedAt: now.toISOString(),
    expiresAt,
    heldBy: null,
    heldAt: null,
    redeemedBy: null,
    redeemedAt: null,
  };
  const reward: StoredReward = { code, amount: REVIEW_VOUCHER_AMOUNT, expiresAt, reviewId, email: record.email, createdAt: record.issuedAt };
  return { id, record, reward, voucherKey: voucherKey(id), rewardKey: rewardKey(reviewId), ttl: REVIEW_VOUCHER_DAYS * 24 * 60 * 60 };
}

export function publicVoucherReward(value: StoredReward | VoucherReward): VoucherReward {
  return { code: value.code, amount: value.amount, expiresAt: value.expiresAt };
}

function validCode(code: string) {
  return /^SMELT-[A-Z0-9_-]{12}$/.test(code);
}

async function voucherFor(codeValue: unknown): Promise<{ id: string; record: VoucherRecord } | null> {
  const code = normalizeVoucherCode(codeValue);
  if (!validCode(code)) return null;
  const id = digest(code);
  const record = parseStored(await adminStore().get<VoucherRecord>(voucherKey(id)));
  return record ? { id, record } : null;
}

export async function validateVoucher(code: unknown, emailValue: unknown): Promise<VoucherReward> {
  const email = typeof emailValue === "string" ? normalizeEmail(emailValue) : "";
  const found = await voucherFor(code);
  const record = found?.record;
  if (!record || record.email !== email || Date.parse(record.expiresAt) <= Date.now() || record.redeemedAt || record.heldBy)
    throw new AdminError("This voucher is invalid, expired, or already attached to a checkout.", 409);
  return { code: normalizeVoucherCode(code), amount: record.amount, expiresAt: record.expiresAt };
}

const RESERVE_VOUCHER = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local voucher = cjson.decode(raw)
if voucher.email ~= ARGV[1] then return -2 end
if voucher.expiresAt <= ARGV[2] then return -3 end
if voucher.redeemedAt then return -4 end
if voucher.heldBy and voucher.heldBy ~= ARGV[3] then return -5 end
voucher.heldBy = ARGV[3]
voucher.heldAt = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(voucher), 'KEEPTTL')
redis.call('SET', KEYS[2], ARGV[4], 'EX', 7776000)
return voucher.amount`;

export async function reserveVoucher(codeValue: unknown, emailValue: string, reference: string): Promise<VoucherMetadata> {
  const code = normalizeVoucherCode(codeValue);
  if (!validCode(code)) throw new AdminError("This voucher is invalid or has expired.", 409);
  const id = digest(code);
  const amount = await adminStore().eval<unknown[], number>(RESERVE_VOUCHER, [voucherKey(id), reservationKey(reference)], [
    normalizeEmail(emailValue), new Date().toISOString(), reference, id,
  ]);
  if (amount !== REVIEW_VOUCHER_AMOUNT) throw new AdminError("This voucher is invalid, expired, or already attached to a checkout.", 409);
  return { id, amount };
}

export function parseVoucherMetadata(value: unknown): VoucherMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.id === "string" && /^[a-f0-9]{64}$/.test(metadata.id) && metadata.amount === REVIEW_VOUCHER_AMOUNT
    ? { id: metadata.id, amount: metadata.amount }
    : null;
}

const COMMIT_VOUCHER = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local voucher = cjson.decode(raw)
if voucher.redeemedAt then return voucher.redeemedBy == ARGV[1] and 1 or 0 end
if voucher.heldBy ~= ARGV[1] or voucher.amount ~= tonumber(ARGV[2]) then return 0 end
voucher.redeemedBy = ARGV[1]
voucher.redeemedAt = ARGV[3]
redis.call('SET', KEYS[1], cjson.encode(voucher), 'EX', 31536000)
redis.call('DEL', KEYS[2])
return 1`;

export async function commitVoucher(reference: string, value: unknown): Promise<boolean> {
  const metadata = parseVoucherMetadata(value);
  if (!metadata) return value === undefined || value === null;
  const committed = await adminStore().eval<unknown[], number>(COMMIT_VOUCHER, [voucherKey(metadata.id), reservationKey(reference)], [
    reference, String(metadata.amount), new Date().toISOString(),
  ]);
  return committed === 1;
}

export async function releaseVoucherReservation(reference: string, value: unknown): Promise<void> {
  const metadata = parseVoucherMetadata(value);
  if (!metadata) return;
  await adminStore().eval(`
local raw = redis.call('GET', KEYS[1])
if not raw then redis.call('DEL', KEYS[2]); return 0 end
local voucher = cjson.decode(raw)
if voucher.heldBy ~= ARGV[1] or voucher.redeemedAt then return 0 end
voucher.heldBy = cjson.null
voucher.heldAt = cjson.null
redis.call('SET', KEYS[1], cjson.encode(voucher), 'KEEPTTL')
redis.call('DEL', KEYS[2])
return 1`, [voucherKey(metadata.id), reservationKey(reference)], [reference]);
}

export async function releaseVoucherCodeReservation(reference: string, codeValue: unknown): Promise<void> {
  const code = normalizeVoucherCode(codeValue);
  if (!validCode(code)) return;
  await releaseVoucherReservation(reference, { id: digest(code), amount: REVIEW_VOUCHER_AMOUNT });
}

export async function getStoredReward(reviewId: string): Promise<StoredReward | null> {
  return parseStored(await adminStore().get<StoredReward>(rewardKey(reviewId)));
}
