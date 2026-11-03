import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), inventory: vi.fn(), hget: vi.fn() }));
vi.mock('./admin/store', () => ({ adminStore: () => mocks, AdminError: class extends Error {} }));
vi.mock('./inventory', () => ({ getInventory: mocks.inventory, RESERVATION_TTL_SECONDS: 3600 }));
import { reservePurchase, commitPurchase, releaseRejectedPurchase, receiveBatch, resolvePurchasePreorder } from './purchaseStore';
import { PREORDER_BATCH, LEGACY_PREORDER_BATCH } from './preorders';
beforeEach(() => { vi.resetAllMocks(); mocks.eval.mockResolvedValue(1); });
describe('November batch isolation', () => {
  it.each([undefined, { accepted: true, batch: LEGACY_PREORDER_BATCH, quantities: { green: 1, cream: 1 } }])('does not accept missing or old batch consent', async consent => {
    mocks.eval.mockResolvedValueOnce(1).mockResolvedValueOnce([0, 0, 0]);
    expect(await reservePurchase({ green: 1, cream: 1 }, 'new-order', consent)).toEqual({ reserved: false });
    expect(mocks.eval.mock.calls[1][2]).toEqual(['new-order', 1, 1, 0, 0, expect.any(String), '1', PREORDER_BATCH]);
    expect(mocks.eval.mock.calls[1][1][1]).toContain(`:capacity:${PREORDER_BATCH}`);
  });
  it.each([undefined, PREORDER_BATCH])('commits and releases against the allocation batch %s', async batch => {
    mocks.hget.mockResolvedValue({ batch });
    await commitPurchase('existing-order', { green: 1, cream: 0 });
    const expected = batch ?? LEGACY_PREORDER_BATCH;
    expect(mocks.eval.mock.calls[0][1][2]).toContain(`:capacity:${expected}`);
    expect(mocks.eval.mock.calls[0][1][3]).toContain(`:received:${expected}`);
    await releaseRejectedPurchase('existing-order');
    expect(mocks.eval.mock.calls[1][1][1]).toContain(`:capacity:${expected}`);
    expect(mocks.eval.mock.calls[1][1][3]).toContain(`:received:${expected}`);
  });
  it('receives only the November allocations in the shared ledger', async () => {
    await receiveBatch(100, 100);
    expect(mocks.eval.mock.calls.at(-1)?.[2]).toEqual([100, 100, expect.any(String), PREORDER_BATCH]);
  });
  it('keeps the customer promise while allowing fully allocated orders to ship early', async () => {
    const preorder = { batch: PREORDER_BATCH, arrival: '30 November 2026', timing: 'dispatch' as const, quantities: { green: 0, cream: 1 } };
    mocks.hget.mockResolvedValue({ status: 'paid', preorderGreen: 0, preorderCream: 0, batch: PREORDER_BATCH });
    expect(await resolvePurchasePreorder('smeltp-new', preorder)).toEqual(preorder);
    expect(await resolvePurchasePreorder('smeltp-new', preorder, true)).toBeUndefined();
  });
});
