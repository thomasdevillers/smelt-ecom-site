import { describe, it, expect } from 'vitest';
import { BASE_PRICE, lineTotal } from './pricing';
import { paidCheckoutTotal } from './checkoutShared';
describe('preorder pricing and historical payments', () => {
  it('charges the preorder price for new purchases', () => {
    expect(BASE_PRICE).toBe(450);
    expect(lineTotal(2)).toBe(900);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 450)).toBe(490);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 50, 550)).toBe(500);
  });
  it('preserves v3 prices and quantity-based shipping after the campaign price change', () => {
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, 550, 'hat-bundles-v3')).toBe(640);
    expect(paidCheckoutTotal({ green: 2, cream: 1 }, 'aramex', 0, 550, 'hat-bundles-v3')).toBe(1550);
    expect(paidCheckoutTotal({ green: 2, cream: 1 }, 'aramex', 0, 450, 'hat-bundles-v3')).toBe(1250);
    expect(paidCheckoutTotal({ green: 2, cream: 2 }, 'aramex', 0, 550, 'hat-bundles-v3')).toBe(2000);
  });
  it.each([[3, 1200], [4, 1600], [5, 2050], [6, 2500], [7, 2800], [8, 3200]])('preserves v4 totals for %i hats', (qty, total) => {
    expect(paidCheckoutTotal({ green: 2, cream: qty - 2 }, 'aramex', 0, 450, 'hat-bundles-v4')).toBe(total);
    expect(paidCheckoutTotal({ green: 2, cream: qty - 2 }, 'aramex', 50, 450, 'hat-bundles-v4')).toBe(total - 50);
  });
  it('preserves legacy R450 payments and rejects unknown price snapshots', () => {
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex')).toBe(540);
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, 1)).toBeNaN();
    expect(paidCheckoutTotal({ green: 1, cream: 0 }, 'aramex', 0, '450')).toBeNaN();
  });
});
