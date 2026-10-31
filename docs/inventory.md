# Stock-only sales

New checkouts reserve physical stock only. There is no preorder mode, capacity setting, consent flow, or campaign batch receipt endpoint. Prices are defined in `lib/pricing.ts`.

`lib/purchaseStore.ts` owns atomic reservation, payment commit, release and expiry. The existing `smelt:preorders:v1` Redis namespace and `smeltp-` references are intentionally preserved: normal sales already use these records. Renaming keys would disconnect paid orders and pending payments. Do not reset stock or historical allocation data.

`lib/legacyPreorders.ts`, historical order displays, and the allocation compatibility branches only interpret previously stored purchases. Old payment links must retain their recorded pricing and allocation checks. No new purchase can allocate future capacity.

Inventory changes must use actual received quantities and account for held and paid allocations. The retired October batch receipt endpoint is unavailable.

`npm test` covers local behavior. The opt-in `RUN_INVENTORY_REDIS_TESTS=1 npx vitest run lib/purchaseStore.integration.test.ts` uses disposable UUID keys, not customer inventory.
