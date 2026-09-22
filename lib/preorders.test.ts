import { describe, it, expect, vi, afterEach } from 'vitest';
import { preorderQuantities, parsePreorder, PREORDER_BATCH, PREORDER_ARRIVAL } from './preorders';
import { orderConfirmationEmail } from './emails/orderConfirmation';
import { localStockTest, stockScope } from './stockEnvironment';
afterEach(() => vi.unstubAllEnvs());
describe('pre-order customer promise', () => {
  it('only requests consent for quantities that cannot ship from current stock', () => {
    expect(preorderQuantities({ green: 3, cream: 1 }, { green: 2, cream: 0 })).toEqual({ green: 1, cream: 1 });
  });
  it('keeps the original arrival estimate in confirmation and removes immediate dispatch claims', () => {
    const email = orderConfirmationEmail({ reference: 'preorder', total: 'R900', items: [{ colour: 'green', name: 'Forest Green', qty: 2 }], preorder: { batch: PREORDER_BATCH, arrival: PREORDER_ARRIVAL, quantities: { green: 2, cream: 0 } } });
    expect(email.subject).toContain('pre-order');
    expect(email.text).toContain('22 October 2026');
    expect(email.text).toContain('entire order');
    expect(email.text).toContain('full refund');
    expect(email.text).not.toContain('Your hat is in stock');
  });
  it('rejects malformed pre-order descriptions', () => {
    expect(parsePreorder({ batch: PREORDER_BATCH, arrival: PREORDER_ARRIVAL, quantities: { green: -1, cream: 0 } })).toBeUndefined();
    expect(parsePreorder(null)).toBeUndefined();
  });
  it('isolates local zero-stock testing even when local credentials point to live services', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('VERCEL', ''); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_example');
    expect(localStockTest()).toBe(true); expect(stockScope()).toBe('local-preorder-test');
    vi.stubEnv('NODE_ENV', 'production');
    expect(localStockTest()).toBe(false); expect(stockScope()).toBe('live');
  });
});
