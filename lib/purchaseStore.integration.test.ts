import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RESERVE_PURCHASE, COMMIT_PURCHASE, RELEASE_REJECTED_PURCHASE, EXPIRE_PURCHASE } from './purchaseStore';

// Opt-in: only disposable UUID-scoped keys, never customer inventory or payments.
describe.skipIf(process.env.RUN_INVENTORY_REDIS_TESTS !== '1')('stock-only allocations (Redis)', () => {
  let db: Redis;
  let keys: string[];
  beforeEach(async () => {
    process.loadEnvFile('.env.local');
    db = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
    const prefix = `smelt:automated-test:${randomUUID()}`;
    keys = [`${prefix}:stock`, `${prefix}:quota`, `${prefix}:orders`, `${prefix}:received`];
    await db.eval(`redis.call('HSET', KEYS[1], 'green', 2, 'cream', 1); redis.call('HSET', KEYS[2], 'green', 100, 'cream', 100); redis.call('HSET', KEYS[3], '_test', '{}'); for _, k in ipairs(KEYS) do redis.call('EXPIRE', k, 120) end; return 1`, keys.slice(0, 3), []);
  });
  afterEach(async () => { if (keys) await db.del(...keys); });
  const reserve = (id: string, g: number, c: number) => db.eval(RESERVE_PURCHASE, keys, [id, g, c, '2026-09-22T10:00:00.000Z']);
  const commit = (id: string, g: number, c: number) => db.eval(COMMIT_PURCHASE, [keys[2], keys[0], keys[1], keys[3]], [id, g, c]);
  const expire = (id: string, cutoff = '2026-09-22T10:00:00.000Z') => db.eval(EXPIRE_PURCHASE, keys, [id, 'expired', cutoff, '2026-09-22T11:00:00.000Z']);

  it('rejects a colour shortfall even with legacy future capacity, without partial deductions', async () => {
    expect(await reserve('too-many', 1, 2)).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 2, cream: 1 });
    expect(await db.hgetall(keys[1])).toEqual({ green: 100, cream: 100 });
  });
  it('cannot oversell the last hat when customers race', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => reserve(`buyer-${i}`, 0, 1)));
    expect(results.filter(r => r === 1)).toHaveLength(1);
    expect(await db.hget(keys[0], 'cream')).toBe(0);
  });
  it('reserves both colours and commits once across repeated callbacks', async () => {
    expect(await reserve('mixed', 2, 1)).toBe(1);
    expect(await reserve('mixed', 2, 1)).toBe(0);
    expect(await commit('mixed', 2, 1)).toBe(1);
    expect(await commit('mixed', 2, 1)).toBe(1);
    expect(await commit('mixed', 3, 1)).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
    expect(await db.hget(keys[2], 'mixed')).not.toHaveProperty('preorderGreen');
  });
  it('returns rejected stock once without reviving the rejected purchase', async () => {
    await reserve('rejected', 2, 1);
    expect(await db.eval(RELEASE_REJECTED_PURCHASE, keys, ['rejected'])).toBe(1);
    expect(await db.eval(RELEASE_REJECTED_PURCHASE, keys, ['rejected'])).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 2, cream: 1 });
    expect(await commit('rejected', 2, 1)).toBe(0);
  });
  it('honours the expiry cutoff and reacquires late payments only once', async () => {
    await reserve('late', 2, 1);
    expect(await expire('late', '2026-09-22T09:59:59.999Z')).toBe(0);
    expect(await expire('late')).toBe(1);
    expect(await expire('late')).toBe(0);
    expect(await commit('late', 2, 1)).toBe(1);
    expect(await commit('late', 2, 1)).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
  });
  it('never releases paid stock when expiry races payment', async () => {
    await reserve('racing', 2, 1);
    await Promise.all([expire('racing'), commit('racing', 2, 1)]);
    expect(await expire('racing')).toBe(0);
    expect(await commit('racing', 2, 1)).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 0 });
  });
  it('rejects late payment allocation when the stock has since sold', async () => {
    await reserve('late', 2, 1);
    await expire('late');
    await reserve('new-buyer', 2, 0);
    expect(await commit('late', 2, 1)).toBe(0);
    expect(await db.hgetall(keys[0])).toEqual({ green: 0, cream: 1 });
  });
  it('reconciles historical holds after their batch arrived', async () => {
    await db.hset(keys[2], { historical: { green: 1, cream: 1, preorderGreen: 1, preorderCream: 1, status: 'held', createdAt: '2026-09-22T10:00:00.000Z' } });
    await db.set(keys[3], 'received', { ex: 120 });
    expect(await expire('historical')).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 3, cream: 2 });
    expect(await commit('historical', 1, 1)).toBe(1);
    expect(await db.hgetall(keys[0])).toEqual({ green: 2, cream: 1 });
  });
  it('protects historical paid allocations before new checkouts', async () => {
    await db.hset(keys[2], { historical: { green: 2, cream: 0, preorderGreen: 2, preorderCream: 0, status: 'paid', createdAt: '2026-09-22T10:00:00.000Z' } });
    expect(await reserve('new-buyer', 1, 0)).toBe(0);
    expect(await db.hget(keys[2], 'historical')).toMatchObject({ preorderGreen: 0, originalPreorderGreen: 2 });
    expect(await db.hget(keys[0], 'green')).toBe(0);
  });
});
