# November 2026 preorders

The manual switch is `PREORDER_MODE = true` in `lib/salesMode.ts`.

- Both colours are sold as paid preorders, including cream while physical hats remain.
- One hat costs R450, two R900, three R1 200, and four R1 600, in any colour mix. Larger carts use four-hat packs, then a three-hat pack and remaining singles.
- Express shipping remains R90 for one hat and free for two or more. Founder delivery and existing vouchers retain their existing rules.
- New preorders ship on 30 November 2026. The countdown ends at midnight at the start of that date in SAST. Expiry is display-only; it does not close checkout or change prices.
- The November batch has 100 incoming hats per colour. `PREORDER_NOVEMBER_GREEN_CAPACITY` and `PREORDER_NOVEMBER_CREAM_CAPACITY` can override first-time seeds; they never overwrite an existing quota.

## Existing cream hats

The storefront hides physical counts during preorder mode. Checkout requires consent for every hat and initially reserves future capacity. After successful payment, the allocation operation can use existing physical stock for paid November orders, releasing the corresponding future capacity. This allows early dispatch of cream orders through the existing admin shipping flow. Mixed orders wait until every hat is allocated. Customer confirmation retains the original November promise.

Use the actual inventory ledger: no stock counter is reset to the owner's reported ten cream hats. Held/unpaid purchases never consume this stock through the early-allocation path.

## Batch and payment compatibility

`PREORDER_BATCH = '2026-11-30'` identifies this new campaign. November capacity and receipt keys are separate from October. The shared orders hash and `smeltp-` references remain unchanged. New allocations record their batch; untagged historical allocations continue to use `LEGACY_PREORDER_BATCH = '2026-10-22'`. Commit, expiry, release and batch receipt use the correct allocation batch. Receiving November must not deduct October orders again.

New payments store `hat-bundles-v4` and the unit price. Versions v1, v2, v3 and unversioned payments retain their recorded bundle and shipping calculations, including the previous R1 250 three-hat preorder price and R1 550 stock price. Existing customer promises remain unchanged.

Existing email and WhatsApp waiting-list records stay accessible in admin. Public signups are paused while preorder mode is on; the current email signup UI returns with normal sales.

## Receive stock and switch back

1. When the shipment physically arrives, use **Admin → Restock requests → Receive the November batch** and enter the actual incoming quantities. Do not include cream stock already recorded in the ledger. Receipt allocates November paid orders and unresolved holds first, closes November capacity and exposes only leftovers. A shortfall is rejected. Receipt cannot run twice.
2. Set `PREORDER_MODE = false` and deploy. Normal sales return to R550 / R1 100 / R1 550 / R2 000, with physical-stock limits and email waiting-list capture. Express shipping is still free only from two hats.
3. Verify homepage, product, bag, checkout and older payment reconciliation. Deploying and live payment/email checks are separate from local tests.

Changing a shipping estimate only requires the display/countdown constants in `lib/salesMode.ts`; keep the batch identity stable once sales begin. Never reset quotas, historical allocations or receipt markers to open another campaign.
