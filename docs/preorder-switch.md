# October 2026 pre-order campaign

The manual switch lives in `lib/salesMode.ts`: `PREORDER_MODE = true`.

- Single hats are R450 now; R550 when the switch is set to false. Three-hat packs are R1 250 and four-hat packs R1 600, with free express delivery in any colour mix. These fixed pack prices remain active after the switch; review them explicitly if the post-restock offer changes. Larger carts use four-hat packs, then a three-hat pack where possible, and remaining hats at the single price.
- New pre-orders ship on 20 October 2026. The 15 October batch is sold out. The countdown ends at the start of 20 October in SAST; it does not promise a dispatch time of day.
- Countdown expiry is display-only. It never changes prices or closes checkout.
- 100 incoming hats per colour, less existing paid reservations and payment holds.
- Existing delivery options, fees, free-delivery threshold, discounts, email offers, and checkout contact phone remain in use.
- Public WhatsApp restock signup is paused. Its code and existing admin records are preserved.
- Storefront, server reservations and checkout treat all new campaign purchases as pre-orders, even if an old physical counter is positive.

## Separate October shipments

The date update does not split the existing inventory ledger into multiple batches or replenish its quota. The receipt action below still covers all outstanding allocations in the shared batch and closes new pre-orders. Do not use it to receive only the sold-out 15 October shipment while 20 October orders remain outstanding. Separate batch allocation and receipt handling needs an inventory migration before those shipments can be received independently.

## When the batch physically arrives

1. Check physical inventory and unresolved payment holds. The read-only check on 29 September found live counters of green 0 / cream 1, although the owner reports both sold out. Campaign mode ignores that leftover counter for new purchases. Reconcile this discrepancy before receiving the batch; do not add a phantom extra cream hat or release a paid allocation. Existing batch capacity was green 98 / cream 100; retain existing promises rather than resetting it to 100.
2. In **Admin → Restock requests → Receive the October batch**, enter the actual received quantities (expected 100 green and 100 cream). This allocates paid pre-orders and unresolved payment holds first, exposes only leftovers, and prevents receiving the same batch twice.
3. Set `PREORDER_MODE = false` in `lib/salesMode.ts` and deploy. This sets new single-hat purchases to R550, removes the countdown and campaign notices, restores the original shop UI and WhatsApp restock option, and disables new pre-orders for this batch.
4. Check homepage, product, cart and checkout. One R550 hat qualifies for the existing R500 free express-delivery threshold. The founders delivery option retains its existing fee. Confirm the stock counts reflect the remainder after reservations.
5. Fulfil paid pre-orders first. Check an earlier R450 order still verifies and its total stays unchanged.

Receive the batch before switching the storefront. Between these steps the campaign may temporarily show fully reserved because receipt closes its quota.

## Preserve order history

`PREORDER_BATCH = '2026-10-22'` in `lib/preorders.ts` is an existing internal storage identifier, not the displayed arrival date. Keep it unchanged for this batch: changing it would create a fresh quota and detach existing restock requests and receipt status. New purchases store 20 October 2026 with `timing: dispatch`, so confirmation pages and customer/owner emails describe shipping rather than arrival. Existing payment metadata retains the original customer promise.

The stock allocation, normal shopping UI, restock signup and admin receipt flow are retained. No database reset is needed to restore normal sales. Do not reset remaining quota: the 100-per-colour limit includes existing reservations. Capacity environment variables are seed values only, not a way to overwrite a live quota.

New payment initialization writes the server-calculated unit price and `pricingVersion: hat-bundles-v1` to Paystack metadata. The version preserves the bundle calculation; payments without a pricing version retain their original full-price totals. Keep the versioned rules stable for previously initialized payments. Verified payments, authenticated webhooks, expiry reconciliation and order email validation use that recorded price; older transactions without a snapshot use the historical R450. This preserves R450 pre-orders across the later price switch while rejecting unrecognised prices.

To change the date for new pre-orders, update the display and countdown constants in `lib/salesMode.ts`, keeping the storage identifier intact. Do not start a new batch by changing that identifier without a separate migration plan.

## Validation and release

Local checks: unit/API tests, actual Redis allocation tests using unique disposable keys, TypeScript, lint and production build. No customer emails or payments are triggered by those tests. Production deployment and a manual browser/checkout check are separate release steps.
