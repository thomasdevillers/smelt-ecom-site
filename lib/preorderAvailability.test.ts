import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn() }));
vi.mock('./admin/store', () => ({ adminStore: () => ({ eval: mocks.eval }), AdminError: class extends Error {} }));
vi.mock('./inventory', () => ({ getInventory: vi.fn(), RESERVATION_TTL_SECONDS: 3600 }));
import { getAvailability, reservePurchase } from './preorderStore';
import { PREORDER_BATCH } from './preorders';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe('manual pre-order availability', () => {
  it('keeps pre-orders open after the countdown and hides old physical counters', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    mocks.eval.mockResolvedValueOnce(1).mockResolvedValueOnce([0, 1, 98, 100]);
    expect(await getAvailability()).toMatchObject({ green: 0, cream: 0, preorder: { green: 98, cream: 100 } });
    mocks.eval.mockResolvedValueOnce(1).mockResolvedValueOnce([1, 1, 0]);
    expect(await reservePurchase({ green: 1, cream: 0 }, 'campaign', { accepted: true, batch: PREORDER_BATCH, quantities: { green: 1, cream: 0 } })).toMatchObject({ reserved: true, preorder: { arrival: '15 October 2026' } });
    expect(mocks.eval.mock.calls.at(-1)?.[2]).toEqual(['campaign', 1, 0, 1, 0, '2026-10-16T10:00:00.000Z', '1']);
  });
});
