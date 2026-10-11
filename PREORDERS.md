# October 2026 pre-orders

New pre-orders ship on 30 October 2026. The 15 October batch is sold out; existing paid orders retain their confirmed timing. Courier transit starts after dispatch. The shared date and display-only countdown live in `lib/salesMode.ts`. See `docs/preorder-switch.md` for the current campaign and the shared inventory ledger limitations when receiving separate October shipments.

## Local testing

Run `npm run dev` and open `/product`. Development outside Vercel uses the isolated Redis scope `local-preorder-test`, seeded with **zero ready stock** and **100 pre-order spaces per colour**. Production ready-stock seeds remain 9 green / 13 cream; existing live Redis counts are untouched. A production build (`npm start`) does not enable the local testing scope.

- Select either sold-out colour: both remain selectable. Choose the pre-order button or expand the WhatsApp signup form.
- Try a mixed bundle and check the bag's colour-specific pre-order quantities and shared shipment notice.
- At checkout, check the pre-order shipping date in the delivery option. The server independently checks the pre-order consent metadata, quantities and available capacity.
- Use Paystack **test** credentials to test payments. Development with local stock testing rejects live Paystack keys. No fake payment success is implemented.
- Confirm a payment and check the success page and confirmation email say pre-order and retain the agreed date.
- Submit a WhatsApp number and find it in `/admin` → Restock requests. No message is automatically sent by signing up.
- Test `/admin` → Orders → Paid pre-orders for oldest-payment-first dispatch priority. Shipping emails are blocked until the batch is received.
- The receive-batch action changes local test availability when used locally. It cannot receive the same batch twice. Use a new isolated test scope if you need another complete receipt rehearsal; do not delete live keys.

## Receiving the shipment

In Restock requests, expand Receive the October batch and enter actual quantities counted. The server atomically allocates all pre-orders and unresolved payment holds first; only leftovers become available for general sales. An insufficient batch is rejected for manual review. The pre-order quota closes after receipt. The countdown is display-only and does not close checkout; campaign mode is controlled manually.

Dispatch paid pre-orders oldest first before ordinary restock sales. WhatsApp links become available for colours with remaining ready stock. Open the prepared message, send it manually, then mark notified. Opening WhatsApp is not delivery confirmation. Remove opt-outs; signup consent is only for this colour's restock, never general marketing. Signup storage is scoped to this batch, deduplicated by normalized phone/colour, rate limited and private to authenticated admin reads.

## Payment reservations

Current stock and future capacity are reserved together in one Redis Lua operation. Verified callbacks/webhooks commit idempotently against the same reference and quantities. An explicit Paystack initialization rejection returns the allocation. Network timeouts, browser cancellation and failed charge attempts do **not** prove the payment link is unusable; their holds remain reserved for reconciliation. Review unresolved references with Paystack before releasing anything. This avoids reselling a hat while an old payment link can still accept money.

Cancellation/refunds before dispatch are handled by contacting the existing support email and the team processing the refund. This feature does not automatically issue refunds, send delay messages or send WhatsApp messages. The team must communicate estimate changes to affected customers. New batches need their own configuration and allocation review; do not simply reset this batch's quota.

## Validation

`npm test` runs unit/route tests. `RUN_INVENTORY_REDIS_TESTS=1 npx vitest run lib/preorderStore.integration.test.ts` runs the actual Lua scripts against disposable UUID-scoped Redis keys using `.env.local`. It covers races, mixed allocations, consent, idempotency, shortage handling and batch receipt, and removes those exact test keys afterwards. It does not use customer stock, create payments or send messages.
