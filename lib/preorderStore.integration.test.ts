import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RESERVE_PURCHASE, COMMIT_PURCHASE, RECEIVE_BATCH, RELEASE_REJECTED_PURCHASE } from './preorderStore';

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
  const reserve = (id: string, g: number, c: number, pg: number, pc: number) => db.eval(RESERVE_PURCHASE, keys, [id, g, c, pg, pc, '2026-09-22T10:00:00Z']);
  it('requires explicit consent for the shortfall and leaves both colours unchanged on rejection', async () => {
    expect(await reserve('no-consent', 2, 1, 0, 0)).toEqual([0, 0, 0]);
    expect(await db.hgetall(keys[0])).toEqual({ green: 1, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 2, cream: 2 });
  });
  it('reserves physical and future hats together and commits once across repeated callbacks', async () => {
    expect(await reserve('mixed', 2, 1, 1, 1)).toEqual([1, 1, 1]);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 1, cream: 1 });
    expect(await db.eval(COMMIT_PURCHASE, [keys[2]], ['mixed', 2, 1])).toBe(1);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2]], ['mixed', 2, 1])).toBe(1);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2]], ['mixed', 3, 1])).toBe(0);
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
    await db.eval(COMMIT_PURCHASE, [keys[2]], ['paid', 1, 1]);
    await reserve('still-paying', 0, 1, 0, 1);
    expect(await db.eval(RECEIVE_BATCH, keys, [100, 100, 'received'])).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 100, cream: 98 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 0, cream: 0 });
    expect(await db.eval(RECEIVE_BATCH, keys, [100, 100, 'again'])).toBe(0);
    expect(await db.hget(keys[0], 'cream')).toBe(98);
    expect(await db.eval(COMMIT_PURCHASE, [keys[2]], ['still-paying', 0, 1])).toBe(1);
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
    expect(await db.eval(COMMIT_PURCHASE, [keys[2]], ['rejected', 2, 1])).toBe(0);
  });
});
