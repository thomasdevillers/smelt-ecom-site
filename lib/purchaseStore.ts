import type { Availability } from './availability';
import { adminStore } from './admin/store';
import { getInventory, RESERVATION_TTL_SECONDS } from './inventory';
import { verifyTransaction } from './paystack';
import { paidCheckoutTotal, sanitizeCart } from './checkoutShared';
import { parseVoucherMetadata } from './vouchers';
import { localStockTest, stockScope } from './stockEnvironment';
import { LEGACY_PREORDER_BATCH, parsePreorder, type PreorderDetails } from './legacyPreorders';
import type { CartState } from './cartReducer';

const prefix = () => `smelt:preorders:v1:${stockScope()}`;
const stockKey = () => `smelt:inventory:v1:${stockScope()}:available`;
const quotaKey = () => `${prefix()}:capacity:${LEGACY_PREORDER_BATCH}`;
export async function getAvailability(): Promise<Availability> {
  return { ...await getInventory(), localTest: localStockTest() };
}
// Returned stock belongs to paid customers before new checkouts. Run inside the
// same Redis operation as a release/commit so no buyer can take it in between.
const REALLOCATE_PAID = `
local function allocatePaid(stock, quota, orders, received)
  if redis.call('EXISTS', received) == 1 then return 0 end
  local waiting = {}
  local rows = redis.call('HGETALL', orders)
  for i = 1, #rows, 2 do
    local d = cjson.decode(rows[i + 1])
    if d.status == 'paid' and not d.preorderOnly and ((d.preorderGreen or 0) > 0 or (d.preorderCream or 0) > 0) then
      table.insert(waiting, {reference=rows[i], allocation=d})
    end
  end
  table.sort(waiting, function(a, b)
    local at = a.allocation.createdAt or ''
    local bt = b.allocation.createdAt or ''
    if at == bt then return a.reference < b.reference end
    return at < bt
  end)
  local moved = 0
  for _, row in ipairs(waiting) do
    local d = row.allocation
    local g = math.min(d.preorderGreen or 0, math.max(0, tonumber(redis.call('HGET', stock, 'green') or '0')))
    local c = math.min(d.preorderCream or 0, math.max(0, tonumber(redis.call('HGET', stock, 'cream') or '0')))
    if g + c > 0 then
      d.originalPreorderGreen = d.originalPreorderGreen or d.preorderGreen
      d.originalPreorderCream = d.originalPreorderCream or d.preorderCream
      d.preorderGreen = (d.preorderGreen or 0) - g
      d.preorderCream = (d.preorderCream or 0) - c
      redis.call('HINCRBY', stock, 'green', -g)
      redis.call('HINCRBY', stock, 'cream', -c)
      redis.call('HINCRBY', quota, 'green', g)
      redis.call('HINCRBY', quota, 'cream', c)
      redis.call('HSET', orders, row.reference, cjson.encode(d))
      moved = moved + g + c
    end
  end
  return moved
end
`;
export const REALLOCATE_PAID_PURCHASES = `${REALLOCATE_PAID}
return allocatePaid(KEYS[1], KEYS[2], KEYS[3], KEYS[4])
`;

// Only physical stock can be reserved. Legacy keys remain stable so existing
// payments, expiry reconciliation and historical allocations stay reachable.
export const RESERVE_PURCHASE = `${REALLOCATE_PAID}
allocatePaid(KEYS[1], KEYS[2], KEYS[3], KEYS[4])
if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then return 0 end
local g = tonumber(redis.call('HGET', KEYS[1], 'green') or '0')
local c = tonumber(redis.call('HGET', KEYS[1], 'cream') or '0')
if tonumber(ARGV[2]) > g or tonumber(ARGV[3]) > c then return 0 end
redis.call('HINCRBY', KEYS[1], 'green', -tonumber(ARGV[2]))
redis.call('HINCRBY', KEYS[1], 'cream', -tonumber(ARGV[3]))
redis.call('HSET', KEYS[3], ARGV[1], cjson.encode({green=tonumber(ARGV[2]), cream=tonumber(ARGV[3]), status='held', createdAt=ARGV[4]}))
return 1
`;
export async function reservePurchase(cart: CartState, reference: string): Promise<{ reserved: boolean }> {
  await getInventory();
  const result = await adminStore().eval(RESERVE_PURCHASE, [stockKey(), quotaKey(), `${prefix()}:orders`, `${prefix()}:received:${LEGACY_PREORDER_BATCH}`], [reference, cart.green, cart.cream, new Date().toISOString()]);
  return { reserved: Number(result) === 1 };
}
export const COMMIT_PURCHASE = `${REALLOCATE_PAID}
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local d = cjson.decode(raw)
if d.green ~= tonumber(ARGV[2]) or d.cream ~= tonumber(ARGV[3]) then return 0 end
if d.status == 'paid' then
  allocatePaid(KEYS[2], KEYS[3], KEYS[1], KEYS[4])
  return 1
end
if d.status ~= 'held' and d.status ~= 'expired' then return 0 end
-- An old payment link can still accept money. Reacquire its original allocation
-- atomically, without silently converting ready stock into a pre-order.
if d.status == 'expired' then
  local pg = d.preorderGreen or 0
  local pc = d.preorderCream or 0
  if redis.call('EXISTS', KEYS[4]) == 1 then pg = 0; pc = 0 end
  local g = d.green - pg
  local c = d.cream - pc
  if tonumber(redis.call('HGET', KEYS[2], 'green') or '0') < g or tonumber(redis.call('HGET', KEYS[2], 'cream') or '0') < c then return 0 end
  if tonumber(redis.call('HGET', KEYS[3], 'green') or '0') < pg or tonumber(redis.call('HGET', KEYS[3], 'cream') or '0') < pc then return 0 end
  redis.call('HINCRBY', KEYS[2], 'green', -g)
  redis.call('HINCRBY', KEYS[2], 'cream', -c)
  redis.call('HINCRBY', KEYS[3], 'green', -pg)
  redis.call('HINCRBY', KEYS[3], 'cream', -pc)
end
d.status = 'paid'
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(d))
allocatePaid(KEYS[2], KEYS[3], KEYS[1], KEYS[4])
return 1
`;
export async function commitPurchase(reference: string, cart: CartState) {
  return Number(await adminStore().eval(COMMIT_PURCHASE, [`${prefix()}:orders`, stockKey(), quotaKey(), `${prefix()}:received:${LEGACY_PREORDER_BATCH}`], [reference, cart.green, cart.cream])) === 1;
}

export async function batchReceived(batch = LEGACY_PREORDER_BATCH) {
  return Boolean(await adminStore().get(`${prefix()}:received:${batch}`));
}

// Releases are atomic with payment commits. Expiry additionally checks the
// cutoff; the caller must verify the provider status before requesting expiry.
const RELEASE_ALLOCATION = `${REALLOCATE_PAID}
local raw = redis.call('HGET', KEYS[3], ARGV[1])
if not raw then return 0 end
local d = cjson.decode(raw)
if d.status ~= 'held' then return 0 end
if ARGV[2] == 'expired' and (not d.createdAt or d.createdAt > ARGV[3]) then return 0 end
if redis.call('EXISTS', KEYS[4]) == 1 then
  redis.call('HINCRBY', KEYS[1], 'green', d.green)
  redis.call('HINCRBY', KEYS[1], 'cream', d.cream)
else
  redis.call('HINCRBY', KEYS[1], 'green', d.green - (d.preorderGreen or 0))
  redis.call('HINCRBY', KEYS[1], 'cream', d.cream - (d.preorderCream or 0))
  redis.call('HINCRBY', KEYS[2], 'green', d.preorderGreen or 0)
  redis.call('HINCRBY', KEYS[2], 'cream', d.preorderCream or 0)
end
d.status = ARGV[2] or 'released'
d.releasedAt = ARGV[4]
redis.call('HSET', KEYS[3], ARGV[1], cjson.encode(d))
allocatePaid(KEYS[1], KEYS[2], KEYS[3], KEYS[4])
return 1
`;
export const RELEASE_REJECTED_PURCHASE = RELEASE_ALLOCATION;
export const EXPIRE_PURCHASE = RELEASE_ALLOCATION;

// For initialization rejection, before a payable link is known to exist.
export async function releaseRejectedPurchase(reference: string) {
  await adminStore().eval(RELEASE_REJECTED_PURCHASE, [stockKey(), quotaKey(), `${prefix()}:orders`, `${prefix()}:received:${LEGACY_PREORDER_BATCH}`], [reference]);
}

interface PurchaseAllocation extends CartState {
  status: 'held' | 'paid' | 'released' | 'expired';
  createdAt: string;
}

// Reconcile before releasing: a missing webhook must not free a paid order.
// Pending payments and provider errors retain their holds for the next run.
export async function expirePurchaseReservations(now = Date.now()) {
  const orders = await adminStore().hgetall<Record<string, PurchaseAllocation>>(`${prefix()}:orders`) || {};
  const cutoff = new Date(now - RESERVATION_TTL_SECONDS * 1000).toISOString();
  const result = { released: 0, paid: 0, retained: 0 };
  const due = Object.entries(orders).filter(([, order]) => order.status === 'held' && Date.parse(order.createdAt) <= Date.parse(cutoff));
  for (let i = 0; i < due.length; i += 5) {
    await Promise.all(due.slice(i, i + 5).map(async ([reference, order]) => {
      try {
        const payment = await verifyTransaction(reference);
        if (payment.reference !== reference) throw new Error('Payment reference mismatch');
        if (payment.status === 'success') {
          const cart = sanitizeCart(payment.metadata?.cart);
          const voucher = parseVoucherMetadata(payment.metadata?.voucher);
          if (payment.metadata?.inventoryReservation !== reference || cart.green !== order.green || cart.cream !== order.cream || payment.currency !== 'ZAR' || payment.amount !== paidCheckoutTotal(cart, payment.metadata?.shippingMethod, voucher?.amount ?? 0, payment.metadata?.unitPrice, payment.metadata?.pricingVersion) * 100)
            throw new Error('Paid reservation requires reconciliation');
          if (await commitPurchase(reference, cart)) result.paid++;
          else result.retained++;
        } else if (payment.status === 'abandoned' || payment.status === 'failed') {
          result.released += Number(await adminStore().eval(EXPIRE_PURCHASE,
            [stockKey(), quotaKey(), `${prefix()}:orders`, `${prefix()}:received:${LEGACY_PREORDER_BATCH}`],
            [reference, 'expired', cutoff, new Date(now).toISOString()]));
        } else result.retained++;
      } catch (error) {
        result.retained++;
        console.error('Reservation expiry retained hold', reference, error instanceof Error ? error.message : 'Verification failed');
      }
    }));
  }
  return result;
}

export async function purchaseNeedsReview(reference: string) {
  if (!reference.startsWith('smeltp-')) return false;
  const order = await adminStore().hget<PurchaseAllocation>(`${prefix()}:orders`, reference);
  return !order || order.status !== 'paid';
}

// Paystack metadata records the original promise; Redis records later stock
// allocations. Only a paid allocation can shorten that original waiting time.
export async function resolvePurchasePreorder(reference: string, metadata: unknown): Promise<PreorderDetails | undefined> {
  const original = parsePreorder(metadata);
  if (!original || original.batch !== LEGACY_PREORDER_BATCH || !reference.startsWith('smeltp-')) return original;
  const allocation = await adminStore().hget<PurchaseAllocation & { preorderGreen: number; preorderCream: number }>(`${prefix()}:orders`, reference);
  if (!allocation || allocation.status !== 'paid') return original;
  const { preorderGreen: green, preorderCream: cream } = allocation;
  if (![green, cream].every(n => Number.isSafeInteger(n) && n >= 0) || green > original.quantities.green || cream > original.quantities.cream) return original;
  return green + cream > 0 ? { ...original, quantities: { green, cream } } : undefined;
}
