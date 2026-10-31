import { describe, it, expect } from 'vitest';
import { BASE_PRICE, lineTotal } from './pricing';
import { paidCheckoutTotal } from './checkoutShared';
describe('stock-only pricing and historical payments', () => {
  it('charges the regular price for new purchases', () => {
    expect(BASE_PRICE).toBe(550);
    expect(lineTotal(2)).toBe(1100);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 450)).toBe(490);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 550)).toBe(500);
  });
  it('preserves legacy R450 payments and rejects unknown price snapshots', () => {
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex')).toBe(540);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, 1)).toBeNaN();
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, '450')).toBeNaN();
  });
});
