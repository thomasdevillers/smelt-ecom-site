import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), inventory: vi.fn() }));
vi.mock('./admin/store', () => ({ adminStore: () => ({ eval: mocks.eval }) }));
vi.mock('./inventory', () => ({ getInventory: mocks.inventory, RESERVATION_TTL_SECONDS: 3600 }));
import { getAvailability, reservePurchase } from './purchaseStore';
beforeEach(() => { vi.clearAllMocks(); mocks.inventory.mockResolvedValue({ green: 16, cream: 29 }); });
describe('physical stock availability', () => {
  it('returns physical stock without campaign capacity or timing', async () => {
    const result = await getAvailability();
    expect(result).toMatchObject({ green: 16, cream: 29 });
    expect(result).not.toHaveProperty('preorder');
    expect(result).not.toHaveProperty('batch');
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('passes only physical quantities to the atomic reservation', async () => {
    mocks.eval.mockResolvedValueOnce(1);
    expect(await reservePurchase({ green: 1, cream: 0 }, 'normal-sale')).toEqual({ reserved: true });
    expect(mocks.eval.mock.calls[0][2]).toEqual(['normal-sale', 1, 0, expect.any(String)]);
    mocks.eval.mockResolvedValueOnce(0);
    expect(await reservePurchase({ green: 99, cream: 0 }, 'too-many')).toEqual({ reserved: false });
  });
});
