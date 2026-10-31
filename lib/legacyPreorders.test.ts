import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePreorder, preorderTiming, LEGACY_PREORDER_BATCH } from './legacyPreorders';
import { orderConfirmationEmail } from './emails/orderConfirmation';
import { ownerOrderEmail } from './emails/ownerOrder';
import { localStockTest, stockScope } from './stockEnvironment';
afterEach(() => vi.unstubAllEnvs());
describe('pre-order customer promise', () => {
  it('shows the shipping date in customer and owner confirmations', () => {
    const preorder = { batch: LEGACY_PREORDER_BATCH, arrival: '22 October 2026', timing: 'dispatch' as const, quantities: { green: 2, cream: 0 } };
    const input = { reference: 'preorder', total: 'R900', items: [{ colour: 'green', name: 'Forest Green', qty: 2 }], preorder };
    const email = orderConfirmationEmail(input);
    const owner = ownerOrderEmail({ ...input, email: 'customer@example.com', customerName: 'Test', cart: { green: 2, cream: 0 }, address: null, shippingMethod: 'aramex', test: true });
    expect(parsePreorder(preorder)).toEqual(preorder);
    expect(email.subject).toContain('pre-order');
    for (const content of [email.text, email.html, owner.text, owner.html]) {
      expect(content).toContain('Your pre-order ships on 22 October 2026.');
      expect(content).toContain('Courier transit starts after dispatch.');
      expect(content).not.toContain('15 October');
      expect(content).not.toContain('Delivery follows arrival');
    }
    expect(email.text).toContain('entire order');
    expect(email.text).toContain('full refund');
    expect(email.text).not.toContain('Your hat is in stock');
  });
  it('preserves the original arrival promise for existing orders', () => {
    const preorder = parsePreorder({ batch: LEGACY_PREORDER_BATCH, arrival: '15 October 2026', quantities: { green: 1, cream: 0 } })!;
    expect(preorderTiming(preorder)).toContain('Expected 15 October 2026. Delivery follows arrival.');
    expect(orderConfirmationEmail({ reference: 'existing', total: 'R450', items: [], preorder }).text).not.toContain('22 October');
  });
  it('rejects malformed pre-order descriptions', () => {
    expect(parsePreorder({ batch: LEGACY_PREORDER_BATCH, arrival: '22 October 2026', quantities: { green: -1, cream: 0 } })).toBeUndefined();
    expect(parsePreorder(null)).toBeUndefined();
  });
  it('isolates local zero-stock testing even when local credentials point to live services', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('VERCEL', ''); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_example');
    expect(localStockTest()).toBe(true); expect(stockScope()).toBe('local-preorder-test');
    vi.stubEnv('NODE_ENV', 'production');
    expect(localStockTest()).toBe(false); expect(stockScope()).toBe('live');
  });
});
