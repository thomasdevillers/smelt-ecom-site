import { describe, it, expect, vi, afterEach } from 'vitest';
import { countdownParts } from './salesMode';
import { paidCheckoutTotal } from './checkoutShared';

afterEach(() => { vi.doUnmock('./salesMode'); vi.resetModules(); });
describe('October pre-order campaign', () => {
  it('counts down to noon SAST and stays at zero afterwards', () => {
    expect(countdownParts(Date.parse('2026-10-14T08:57:13Z'))).toEqual([1, 1, 2, 47]);
    expect(countdownParts(Date.parse('2026-10-15T10:00:00Z'))).toEqual([0, 0, 0, 0]);
    expect(countdownParts(Date.parse('2026-10-18T10:00:00Z'))).toEqual([0, 0, 0, 0]);
  });
  it('restores regular pricing only through the manual switch', async () => {
    vi.doMock('./salesMode', () => ({ PREORDER_MODE: false, PREORDER_PRICE: 450, REGULAR_PRICE: 550 }));
    const pricing = await import('./pricing');
    expect(pricing.BASE_PRICE).toBe(550);
    expect(pricing.lineTotal(2)).toBe(1100);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 450)).toBe(490);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 550)).toBe(500);
  });
  it('preserves legacy R450 payments and rejects unknown price snapshots', () => {
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex')).toBe(540);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, 1)).toBeNaN();
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, '450')).toBeNaN();
  });
});
