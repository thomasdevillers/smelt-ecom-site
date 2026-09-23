import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hgetall: vi.fn(), hget: vi.fn(), eval: vi.fn(), verify: vi.fn() }));
vi.mock('./admin/store', () => ({ adminStore: () => mocks, AdminError: class extends Error {} }));
vi.mock('./paystack', () => ({ verifyTransaction: mocks.verify }));
import { expirePurchaseReservations, purchaseNeedsReview, EXPIRE_PURCHASE, COMMIT_PURCHASE } from './preorderStore';
import { GET } from '../app/api/cron/inventory/route';

const now = Date.parse('2026-09-23T12:00:00.000Z');
const reference = 'smeltp-expiry-test';
const held = { status: 'held', green: 1, cream: 0, createdAt: '2026-09-23T11:00:00.000Z' };
const payment = { reference, status: 'abandoned', currency: 'ZAR', amount: 54000, metadata: { cart: { green: 1, cream: 0 }, shippingMethod: 'aramex', inventoryReservation: reference } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hgetall.mockResolvedValue({ [reference]: held });
  mocks.eval.mockResolvedValue(1);
  mocks.verify.mockResolvedValue(payment);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('reservation expiry reconciliation', () => {
  it.each(['abandoned', 'failed'])('releases a one-hour-old %s payment hold', async status => {
    mocks.verify.mockResolvedValue({ ...payment, status });
    expect(await expirePurchaseReservations(now)).toEqual({ released: 1, paid: 0, retained: 0 });
    expect(mocks.eval).toHaveBeenCalledWith(EXPIRE_PURCHASE, expect.any(Array), [reference, 'expired', held.createdAt, new Date(now).toISOString()]);
  });
  it.each(['pending', 'ongoing', 'processing', 'queued', 'reversed', 'unknown'])('retains %s payments', async status => {
    mocks.verify.mockResolvedValue({ ...payment, status });
    expect((await expirePurchaseReservations(now)).retained).toBe(1);
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('retains the hold when provider verification fails', async () => {
    mocks.verify.mockRejectedValue(new Error('Timeout'));
    expect((await expirePurchaseReservations(now)).retained).toBe(1);
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('commits verified paid orders instead of expiring a delayed webhook', async () => {
    mocks.verify.mockResolvedValue({ ...payment, status: 'success' });
    expect(await expirePurchaseReservations(now)).toEqual({ released: 0, paid: 1, retained: 0 });
    expect(mocks.eval).toHaveBeenCalledWith(COMMIT_PURCHASE, expect.any(Array), [reference, 1, 0]);
  });
  it.each([{ reference: 'wrong-reference' }, { amount: 1 }, { currency: 'USD' }, { metadata: {} }])('retains inconsistent payment records: %j', async mismatch => {
    mocks.verify.mockResolvedValue({ ...payment, status: 'success', ...mismatch });
    expect((await expirePurchaseReservations(now)).retained).toBe(1);
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('does not query paid, released, expired or younger reservations', async () => {
    mocks.hgetall.mockResolvedValue({
      paid: { ...held, status: 'paid' }, released: { ...held, status: 'released' }, expired: { ...held, status: 'expired' },
      younger: { ...held, createdAt: '2026-09-23T11:00:00.001Z' },
    });
    expect(await expirePurchaseReservations(now)).toEqual({ released: 0, paid: 0, retained: 0 });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('flags unallocated new orders for review while allowing paid and legacy orders', async () => {
    mocks.hget.mockResolvedValue({ ...held, status: 'expired' });
    expect(await purchaseNeedsReview(reference)).toBe(true);
    mocks.hget.mockResolvedValue({ ...held, status: 'paid' });
    expect(await purchaseNeedsReview(reference)).toBe(false);
    expect(await purchaseNeedsReview('legacy-payment')).toBe(false);
  });
  it('requires cron authentication before reading reservations', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    expect((await GET(new Request('https://example.com/api/cron/inventory'))).status).toBe(401);
    expect(mocks.hgetall).not.toHaveBeenCalled();
    mocks.hgetall.mockResolvedValue({});
    expect((await GET(new Request('https://example.com/api/cron/inventory', { headers: { authorization: 'Bearer test-secret' } }))).status).toBe(200);
  });
});
