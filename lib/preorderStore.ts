import { adminStore, AdminError } from './admin/store';
import { getInventory } from './inventory';
import { localStockTest, stockScope } from './stockEnvironment';
import { PREORDER_BATCH, PREORDER_ARRIVAL, PREORDER_TIMING, type Availability, type PreorderDetails } from './preorders';
import type { CartState } from './cartReducer';

const prefix = () => `smelt:preorders:v1:${stockScope()}`;
const stockKey = () => `smelt:inventory:v1:${stockScope()}:available`;
const quotaKey = () => `${prefix()}:capacity:${PREORDER_BATCH}`;
function capacity(colour: 'GREEN' | 'CREAM') {
  const value = Number(process.env[`PREORDER_${colour}_CAPACITY`] ?? 100);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
async function seed() {
  await getInventory();
  await adminStore().eval(`redis.call('HSETNX', KEYS[1], 'green', ARGV[1]); redis.call('HSETNX', KEYS[1], 'cream', ARGV[2]); return 1`, [quotaKey()], [capacity('GREEN'), capacity('CREAM')]);
}
export async function getAvailability(): Promise<Availability> {
  await seed();
  const values = await adminStore().eval<(string | number)[], number[]>(`return {tonumber(redis.call('HGET', KEYS[1], 'green')), tonumber(redis.call('HGET', KEYS[1], 'cream')), tonumber(redis.call('HGET', KEYS[2], 'green')), tonumber(redis.call('HGET', KEYS[2], 'cream'))}`, [stockKey(), quotaKey()], []);
  const open = Date.now() < Date.parse(`${PREORDER_BATCH}T00:00:00+02:00`);
  return { green: values[0], cream: values[1], preorder: { green: open ? values[2] : 0, cream: open ? values[3] : 0 }, batch: PREORDER_BATCH, timing: PREORDER_TIMING, localTest: localStockTest() };
}
// One atomic operation reserves current stock AND future capacity. A consented
// quantity is a ceiling: stock disappearing cannot silently increase a pre-order.
export const RESERVE_PURCHASE = `
if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then return {0, 0, 0} end
local g = tonumber(redis.call('HGET', KEYS[1], 'green'))
local c = tonumber(redis.call('HGET', KEYS[1], 'cream'))
local pg = math.max(0, tonumber(ARGV[2]) - g)
local pc = math.max(0, tonumber(ARGV[3]) - c)
if pg > tonumber(ARGV[4]) or pc > tonumber(ARGV[5]) then return {0, 0, 0} end
if pg > tonumber(redis.call('HGET', KEYS[2], 'green')) or pc > tonumber(redis.call('HGET', KEYS[2], 'cream')) then return {0, 0, 0} end
redis.call('HINCRBY', KEYS[1], 'green', -(tonumber(ARGV[2]) - pg))
redis.call('HINCRBY', KEYS[1], 'cream', -(tonumber(ARGV[3]) - pc))
redis.call('HINCRBY', KEYS[2], 'green', -pg)
redis.call('HINCRBY', KEYS[2], 'cream', -pc)
redis.call('HSET', KEYS[3], ARGV[1], cjson.encode({green=tonumber(ARGV[2]), cream=tonumber(ARGV[3]), preorderGreen=pg, preorderCream=pc, status='held', createdAt=ARGV[6]}))
return {1, pg, pc}
`;
export async function reservePurchase(cart: CartState, reference: string, consent: unknown): Promise<{ reserved: boolean; preorder?: PreorderDetails }> {
  await seed();
  const d = consent as { batch?: string; quantities?: CartState; accepted?: boolean } | undefined;
  const accepted = d?.accepted === true && d.batch === PREORDER_BATCH && Date.now() < Date.parse(`${PREORDER_BATCH}T00:00:00+02:00`);
  const safe = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 99 ? n : 0;
  const r = await adminStore().eval<(string | number)[], number[]>(RESERVE_PURCHASE, [stockKey(), quotaKey(), `${prefix()}:orders`], [reference, cart.green, cart.cream, accepted ? safe(d?.quantities?.green) : 0, accepted ? safe(d?.quantities?.cream) : 0, new Date().toISOString()]);
  return { reserved: r[0] === 1, ...(r[1] + r[2] > 0 ? { preorder: { batch: PREORDER_BATCH, arrival: PREORDER_ARRIVAL, quantities: { green: r[1], cream: r[2] } } } : {}) };
}
export const COMMIT_PURCHASE = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local d = cjson.decode(raw)
if d.status == 'released' or d.green ~= tonumber(ARGV[2]) or d.cream ~= tonumber(ARGV[3]) then return 0 end
d.status = 'paid'
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(d))
return 1
`;
export async function commitPurchase(reference: string, cart: CartState) {
  return Number(await adminStore().eval(COMMIT_PURCHASE, [`${prefix()}:orders`], [reference, cart.green, cart.cream])) === 1;
}

export async function batchReceived(batch = PREORDER_BATCH) {
  return Boolean(await adminStore().get(`${prefix()}:received:${batch}`));
}

// Allocate ALL promised units before making leftover stock available. Holds
// with an unresolved payment remain covered even when a webhook arrives late.
export const RECEIVE_BATCH = `
if redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
local pg = 0
local pc = 0
for _, raw in ipairs(redis.call('HVALS', KEYS[3])) do
  local d = cjson.decode(raw)
  if d.status ~= 'released' then
    pg = pg + (d.preorderGreen or 0)
    pc = pc + (d.preorderCream or 0)
  end
end
if pg > tonumber(ARGV[1]) or pc > tonumber(ARGV[2]) then return -1 end
redis.call('HINCRBY', KEYS[1], 'green', tonumber(ARGV[1]) - pg)
redis.call('HINCRBY', KEYS[1], 'cream', tonumber(ARGV[2]) - pc)
redis.call('HSET', KEYS[2], 'green', 0, 'cream', 0)
redis.call('SET', KEYS[4], ARGV[3])
return 1
`;
export async function receiveBatch(green: unknown, cream: unknown) {
  if (![green, cream].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 10000)) throw new AdminError('Enter the actual received quantity for each colour.');
  await seed();
  const result = Number(await adminStore().eval(RECEIVE_BATCH, [stockKey(), quotaKey(), `${prefix()}:orders`, `${prefix()}:received:${PREORDER_BATCH}`], [green as number, cream as number, new Date().toISOString()]));
  if (result === -1) throw new AdminError('The received batch does not cover existing pre-orders and payment holds. Review the shortfall before releasing stock.', 409);
  return result === 1;
}

// Only for an explicit provider initialization rejection, before any payable
// link exists. Browser cancellation/timeouts are never sufficient evidence.
export const RELEASE_REJECTED_PURCHASE = `
local raw = redis.call('HGET', KEYS[3], ARGV[1])
if not raw then return 0 end
local d = cjson.decode(raw)
if d.status ~= 'held' then return 0 end
if redis.call('EXISTS', KEYS[4]) == 1 then
  redis.call('HINCRBY', KEYS[1], 'green', d.green)
  redis.call('HINCRBY', KEYS[1], 'cream', d.cream)
else
  redis.call('HINCRBY', KEYS[1], 'green', d.green - d.preorderGreen)
  redis.call('HINCRBY', KEYS[1], 'cream', d.cream - d.preorderCream)
  redis.call('HINCRBY', KEYS[2], 'green', d.preorderGreen)
  redis.call('HINCRBY', KEYS[2], 'cream', d.preorderCream)
end
d.status = 'released'
redis.call('HSET', KEYS[3], ARGV[1], cjson.encode(d))
return 1
`;
export async function releaseRejectedPurchase(reference: string) {
  await adminStore().eval(RELEASE_REJECTED_PURCHASE, [stockKey(), quotaKey(), `${prefix()}:orders`, `${prefix()}:received:${PREORDER_BATCH}`], [reference]);
}
