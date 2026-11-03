# Inventory and preorders

The manual storefront switch lives in `lib/salesMode.ts`. See [the preorder switch guide](preorder-switch.md) for November capacity, pricing, receipt and normal-sales restoration.

`lib/purchaseStore.ts` owns atomic reservation, payment commit, release, expiry and batch receipt. The existing `smelt:preorders:v1` Redis namespace and `smeltp-` references are preserved. Physical stock is shared; future capacity and receipt status belong to each batch. New allocations carry their batch, while untagged historical allocations retain the October identity.

During preorder mode every new hat requires preorder consent. Successfully paid November orders can be allocated existing physical stock for early dispatch without changing the customer-facing promise. Never reset stock or historical allocation data.

`npm test` covers local behavior. The opt-in `RUN_INVENTORY_REDIS_TESTS=1 node_modules/.bin/vitest run lib/purchaseStore.integration.test.ts lib/preorderStore.integration.test.ts --testTimeout=20000` uses disposable UUID keys, not customer inventory.
