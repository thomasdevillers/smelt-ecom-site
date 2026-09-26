import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RESERVE_PURCHASE, COMMIT_PURCHASE, RECEIVE_BATCH, RELEASE_REJECTED_PURCHASE, EXPIRE_PURCHASE } from './preorderStore';

// Opt-in: runs the actual Lua scripts against disposable, uniquely named keys.
// Never reads/writes the store's stock, customer, or payment records.
describe.skipIf(process.env.RUN_INVENTORY_REDIS_TESTS !== '1')('atomic purchase allocations (Redis)', () => {
  let db: Redis;
  let keys: string[];
  beforeEach(async () => {
    process.loadEnvFile('.env.local');
    db = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
    const prefix = `smelt:automated-test:${randomUUID()}`;
    keys = [`${prefix}:stock`, `${prefix}:quota`, `${prefix}:orders`, `${prefix}:received`];
    await db.eval(`redis.call('HSET', KEYS[1], 'green', 1, 'cream', 0); redis.call('HSET', KEYS[2], 'green', 2, 'cream', 2); redis.call('HSET', KEYS[3], '_test', '{}'); for _, k in ipairs(KEYS) do redis.call('EXPIRE', k, 120) end; return 1`, keys.slice(0, 3), []);
  });
  afterEach(async () => { if (keys) await db.del(...keys); });
  const reserve = (id: string, g: number, c: number, pg: number, pc: number) => db.eval(RESERVE_PURCHASE, keys, [id, g, c, pg, pc, '2026-09-22T10:00:00.000Z']);
  it('requires explicit consent for the shortfall and leaves both colours unchanged on rejection', async () => {
    expect(await reserve('no-consent', 2, 1, 0, 0)).toEqual([0, 0, 0]);
    expect(await db.hgetall(keys[0])).toEqual({ green: 1, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 2, cream: 2 });
  });
  it('reserves physical and future hats together and commits once across repeated callbacks', async () => {
    expect(await reserve('mixed', 2, 1, 1, 1)).toEqual([1, 1, 1]);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 1, cream: 1 });
    expect(await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['mixed', 2, 1])).toBe(1);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['mixed', 2, 1])).toBe(1);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['mixed', 3, 1])).toBe(0);
    expect(await db.hgetall(keys[1])).toEqual({ green: 1, cream: 1 });
  });
  it('does not oversell the final two pre-order spaces when customers race', async () => {
    const result = await Promise.all(Array.from({ length: 6 }, (_, i) => reserve(`buyer-${i}`, 0, 1, 0, 1)));
    expect(result.filter(r => (r as number[])[0] === 1)).toHaveLength(2);
    expect(await db.hget(keys[1], 'cream')).toBe(0);
  });
  it('rejects a duplicate reference without reserving twice', async () => {
    expect(await reserve('same', 1, 0, 0, 0)).toEqual([1, 0, 0]);
    expect(await reserve('same', 1, 0, 1, 0)).toEqual([0, 0, 0]);
    expect(await db.hget(keys[1], 'green')).toBe(2);
  });
  it('allocates paid and unresolved pre-orders before exposing leftovers, and cannot receive twice', async () => {
    await reserve('paid', 1, 1, 0, 1);
    await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['paid', 1, 1]);
    await reserve('still-paying', 0, 1, 0, 1);
    expect(await db.eval(RECEIVE_BATCH, keys, [100, 100, 'received'])).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 100, cream: 98 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 0, cream: 0 });
    expect(await db.eval(RECEIVE_BATCH, keys, [100, 100, 'again'])).toBe(0);
    expect(await db.hget(keys[0], 'cream')).toBe(98);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['still-paying', 0, 1])).toBe(1);
  });
  it('does not release general stock when the received shipment cannot cover promises', async () => {
    await reserve('paid', 0, 2, 0, 2);
    expect(await db.eval(RECEIVE_BATCH, keys, [100, 1, 'received'])).toBe(-1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 1, cream: 0 });
    expect(await db.get(keys[3])).toBeNull();
  });
  it('returns capacity once after definite initialization rejection, and does not revive a rejected reservation', async () => {
    await reserve('rejected', 2, 1, 1, 1);
    expect(await db.eval(RELEASE_REJECTED_PURCHASE, keys, ['rejected'])).toBe(1);
    expect(await db.eval(RELEASE_REJECTED_PURCHASE, keys, ['rejected'])).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 1, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 2, cream: 2 });
    expect(await db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], ['rejected', 2, 1])).toBe(0);
  });
  const expire = (id: string, cutoff = '2026-09-22T10:00:00.000Z') => db.eval(EXPIRE_PURCHASE, keys, [id, 'expired', cutoff, '2026-09-22T11:00:00.000Z']);
  const commit = (id: string, g: number, c: number) => db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], [id, g, c]);
  it('expires only after one hour and returns physical stock and capacity exactly once', async () => {
    await reserve('unpaid', 2, 1, 1, 1);
    expect(await expire('unpaid', '2026-09-22T09:59:59.999Z')).toBe(0);
    expect(await expire('unpaid')).toBe(1);
    expect(await expire('unpaid')).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 1, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 2, cream: 2 });
  });
  it('never releases a paid allocation, including a callback racing the expiry', async () => {
    await reserve('racing', 1, 0, 0, 0);
    await Promise.all([expire('racing'), commit('racing', 1, 0)]);
    expect(await db.hget(keys[0], 'green')).toBe(0);
    expect(await expire('racing')).toBe(0);
    expect(await commit('racing', 1, 0)).toBe(1);
  });
  it('reacquires an expired allocation only once when payment arrives late', async () => {
    await reserve('late', 2, 1, 1, 1);
    await expire('late');
    expect(await commit('late', 2, 1)).toBe(1);
    expect(await commit('late', 2, 1)).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 1, cream: 1 });
  });
  it('rejects late fulfilment without partial deductions when the stock has been sold', async () => {
    await reserve('late', 1, 1, 0, 1);
    await expire('late');
    await reserve('new-buyer', 1, 0, 0, 0);
    expect(await commit('late', 1, 1)).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 2, cream: 2 });
  });
  it('does not deduct expired pre-orders from an arriving batch and reacquires from arrived stock', async () => {
    await reserve('late', 2, 1, 1, 1);
    await expire('late');
    expect(await db.eval(RECEIVE_BATCH, keys, [5, 5, 'received'])).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 6, cream: 5 });
    expect(await commit('late', 2, 1)).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 4, cream: 4 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 0, cream: 0 });
  });
  it('returns all units to physical stock when expiry occurs after batch receipt', async () => {
    await reserve('unpaid', 2, 1, 1, 1);
    await db.eval(RECEIVE_BATCH, keys, [5, 5, 'received']);
    expect(await expire('unpaid')).toBe(1);
    expect(await expire('unpaid')).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 6, cream: 5 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 0, cream: 0 });
  });

  it('gives an expired hold to a paid pre-order before another checkout can take it', async () => {
    await reserve('abandoned', 1, 0, 0, 0);
    await reserve('paid-preorder', 1, 0, 1, 0);
    await commit('paid-preorder', 1, 0);
    expect(await expire('abandoned')).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hget(keys[2], 'paid-preorder')).toMatchObject({ status: 'paid', preorderGreen: 0, originalPreorderGreen: 1 });
    expect(await db.hget(keys[1], 'green')).toBe(2);
    expect(await expire('abandoned')).toBe(0);
    expect(await commit('paid-preorder', 1, 0)).toBe(1);
    expect(await reserve('next-buyer', 1, 0, 0, 0)).toEqual([0, 0, 0]);
    expect(await reserve('next-buyer', 1, 0, 1, 0)).toEqual([1, 1, 0]);
  });
  it('allocates stock released before the pre-order payment completes', async () => {
    await reserve('abandoned', 1, 0, 0, 0);
    await reserve('still-paying', 1, 0, 1, 0);
    await expire('abandoned');
    expect(await db.hget(keys[0], 'green')).toBe(1);
    await commit('still-paying', 1, 0);
    expect(await db.hget(keys[0], 'green')).toBe(0);
    expect(await db.hget(keys[2], 'still-paying')).toMatchObject({ preorderGreen: 0 });
    expect(await commit('abandoned', 1, 0)).toBe(0);
  });
  it('allocates limited returned stock to the oldest paid reservation and preserves the remaining shortfall', async () => {
    await reserve('abandoned', 1, 0, 0, 0);
    await reserve('older', 1, 0, 1, 0);
    await db.eval(RESERVE_PURCHASE, keys, ['newer', 1, 0, 1, 0, '2026-09-22T10:01:00.000Z']);
    await commit('newer', 1, 0);
    await commit('older', 1, 0);
    await expire('abandoned');
    expect(await db.hget(keys[2], 'older')).toMatchObject({ preorderGreen: 0 });
    expect(await db.hget(keys[2], 'newer')).toMatchObject({ preorderGreen: 1 });
    expect(await db.hget(keys[0], 'green')).toBe(0);
  });

});
