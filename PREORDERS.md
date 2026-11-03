# November 2026 preorders

Preorders are active for both colours, shipping on 30 November 2026. See [the switch guide](docs/preorder-switch.md) for prices, 100-per-colour incoming capacity, early cream dispatch, payment compatibility and receiving stock.

## Local testing

Development outside Vercel uses `local-preorder-test`, with zero physical-stock seeds and separate preorder capacity. Existing Redis counters are never reset. Development refuses live Paystack credentials for checkout; use test credentials for a payment rehearsal.

Check product colour/bundle options, cart quantity limits, preorder notices, countdown, checkout consent, server-calculated prices, success page and confirmation templates. Check both preorder and normal-sales modes. No payment success is simulated by the application.

`npm test` covers the application with mocked providers. Opt-in Redis tests in `lib/purchaseStore.integration.test.ts` and `lib/preorderStore.integration.test.ts` execute real Lua using disposable UUID keys and remove those keys afterwards. They cover stock limits, consent, concurrent reservations, idempotent commits/releases, expiry, old/new batch isolation, early allocation and receipt. They do not create payments, send messages or change customer inventory.
