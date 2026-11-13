import { AdminError, adminStore, digest } from "./admin/store";

export interface Coupon { code: string; amount: number; uses: number; maxUses: number; redeemed: number; held: number; active: boolean; createdAt: string }
export interface CouponMetadata { kind: "coupon"; id: string; amount: number }
const prefix = () => `smelt:coupons:v1:${process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"}`;
const key = (id: string) => `${prefix()}:code:${id}`;
const reservationKey = (reference: string) => `${prefix()}:reservation:${digest(reference)}`;
const normalize = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
export const validCouponAmount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 100000;

export async function createCoupon(codeValue: unknown, amount: unknown, maxUses: unknown): Promise<Coupon> {
  const code = normalize(codeValue);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) || code.startsWith("SMELT-")) throw new AdminError("Use 3–40 letters, numbers, hyphens or underscores. SMELT- is reserved.");
  if (!validCouponAmount(amount)) throw new AdminError("Enter a whole-rand discount between R1 and R100 000.");
  if (typeof maxUses !== "number" || !Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 1000000) throw new AdminError("Enter a usage limit between 1 and 1 000 000.");
  const coupon: Coupon = { code, amount, uses: 0, maxUses, redeemed: 0, held: 0, active: true, createdAt: new Date().toISOString() };
  const saved = await adminStore().eval<unknown[], number>(`
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[2], ARGV[2])
return 1`, [key(digest(code)), `${prefix()}:index`], [JSON.stringify(coupon), digest(code)]);
  if (!saved) throw new AdminError("This coupon code already exists.", 409);
  return coupon;
}

export async function listCoupons(): Promise<Coupon[]> {
  const db = adminStore();
  const ids = await db.smembers<string[]>(`${prefix()}:index`);
  if (!ids.length) return [];
  const coupons = await db.mget<(Coupon | null)[]>(...ids.map(key));
  return coupons.filter((coupon): coupon is Coupon => coupon !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setCouponActive(codeValue: unknown, active: unknown) {
  if (typeof active !== "boolean") throw new AdminError("Invalid coupon status.");
  const saved = await adminStore().eval<unknown[], number>(`
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local coupon = cjson.decode(raw)
coupon.active = ARGV[1] == 'true'
redis.call('SET', KEYS[1], cjson.encode(coupon))
return 1`, [key(digest(normalize(codeValue)))], [String(active)]);
  if (!saved) throw new AdminError("Coupon not found.", 404);
}

export async function findCoupon(codeValue: unknown): Promise<Coupon | null> {
  const code = normalize(codeValue);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) || code.startsWith("SMELT-")) return null;
  return adminStore().get<Coupon>(key(digest(code)));
}

export async function reserveCoupon(codeValue: unknown, email: string, reference: string): Promise<CouponMetadata> {
  const id = digest(normalize(codeValue));
  const amount = await adminStore().eval<unknown[], number>(`
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local coupon = cjson.decode(raw)
local existing = redis.call('GET', KEYS[2])
if existing then
  local reservation = cjson.decode(existing)
  if reservation.id ~= ARGV[1] or reservation.email ~= ARGV[2] or reservation.status ~= 'held' then return -1 end
  return reservation.amount
end
if not coupon.active or coupon.redeemed + coupon.held >= coupon.maxUses then return -1 end
coupon.held = coupon.held + 1
redis.call('SET', KEYS[1], cjson.encode(coupon))
redis.call('SET', KEYS[2], cjson.encode({id=ARGV[1], amount=coupon.amount, email=ARGV[2], status='held'}))
return coupon.amount`, [key(id), reservationKey(reference)], [id, email.trim().toLowerCase()]);
  if (!validCouponAmount(amount)) throw new AdminError("This coupon is invalid, inactive, or has no uses left.", 409);
  return { kind: "coupon", id, amount };
}

export async function commitCoupon(reference: string, metadata: CouponMetadata): Promise<boolean> {
  const result = await adminStore().eval<unknown[], number>(`
local raw = redis.call('GET', KEYS[2])
if not raw then return 0 end
local reservation = cjson.decode(raw)
if reservation.id ~= ARGV[1] or reservation.amount ~= tonumber(ARGV[2]) then return 0 end
if reservation.status == 'paid' then return 1 end
if reservation.status ~= 'held' then return 0 end
local couponRaw = redis.call('GET', KEYS[1])
if not couponRaw then return 0 end
local coupon = cjson.decode(couponRaw)
coupon.held = coupon.held - 1
coupon.redeemed = coupon.redeemed + 1
reservation.status = 'paid'
redis.call('SADD', KEYS[3], reservation.email)
coupon.uses = redis.call('SCARD', KEYS[3])
redis.call('SET', KEYS[1], cjson.encode(coupon))
redis.call('SET', KEYS[2], cjson.encode(reservation))
return 1`, [key(metadata.id), reservationKey(reference), `${key(metadata.id)}:customers`], [metadata.id, String(metadata.amount)]);
  return result === 1;
}

export async function releaseCoupon(reference: string) {
  // The caller must first establish that the payment link cannot be paid.
  const reservation = await adminStore().get<{ id: string }>(reservationKey(reference));
  if (!reservation) return;
  await adminStore().eval(`
local raw = redis.call('GET', KEYS[2])
if not raw then return 0 end
local reservation = cjson.decode(raw)
if reservation.status ~= 'held' then return 0 end
local couponRaw = redis.call('GET', KEYS[1])
if not couponRaw then return 0 end
local coupon = cjson.decode(couponRaw)
coupon.held = coupon.held - 1
reservation.status = 'released'
redis.call('SET', KEYS[1], cjson.encode(coupon))
redis.call('SET', KEYS[2], cjson.encode(reservation))
return 1`, [key(reservation.id), reservationKey(reference)], []);
}
