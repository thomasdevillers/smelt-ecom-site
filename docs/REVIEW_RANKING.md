# Helpful review ranking

Review approval and photo removal schedule scoring after the admin response. An authenticated cron at `/api/cron/review-rankings` backfills and retries every ten minutes, at most three AI calls per run. Failures back off from one hour to 24 hours; they do not block publication. Redis leases deduplicate concurrent workers. Nothing sends email or changes moderation, ratings or rewards.

## Rollout

1. Configure existing `OPENAI_API_KEY`, Upstash, and Vercel Blob credentials. For local access to private images, use a Blob read-write token. Run `npm run reviews:rank -- --live --check` to verify the live review count and credential presence without AI calls, writes, or printing review text. Your Redis settings must point to the database used by the live site.
2. Run `npm run reviews:rank -- --live --score` to score existing published live reviews and print their order. This makes paid OpenAI calls and saves scores, which the storefront uses by default. Use `--test` instead for test reviews. Explicit flags select the same namespace for review reads, score writes, locks and retries **without changing payment credentials**. Without either flag, the command defaults to the namespace selected by `PAYSTACK_SECRET_KEY`; a missing/test key means TEST. Without `--score`, the command only reads stored scores and prints a preview. Output contains review text: do not publish it indiscriminately. Empty namespaces and incomplete scoring now exit unsuccessfully instead of implying a successful backfill; an empty namespace also reports the other namespace's published count.
3. Set `REVIEW_RANKING_ENABLED=true` in Vercel to enable ongoing scoring, then deploy. The cron requires the existing `CRON_SECRET` and the project's existing frequent-cron hosting support.
4. Disable `REVIEW_RANKING_ENABLED` to stop AI calls without changing saved-score ordering. `REVIEW_RANKING_SORT_ENABLED` is no longer required or read. Shoppers can switch between Most helpful (default) and Most recent.

If `--check` finds reviews but reports missing Blob credentials, add a read-write token from the connected Vercel Blob store to `.env.local` as `BLOB_READ_WRITE_TOKEN`. Alternatively, use a valid `VERCEL_OIDC_TOKEN` together with `BLOB_STORE_ID`; a token alone is insufficient, and local OIDC tokens expire. Never paste credentials into chat or commit `.env.local`. The command checks credential presence before starting a scoring backfill; it does not verify their validity until an image/provider request is attempted.

## Rubric and storage

Integer scores 0–10: practical usefulness (35%), specificity (30%), use context (20%), clarity (15%). Text can earn 100 points; useful image evidence adds at most five. Scores are helpfulness estimates, not conversion predictions or authenticity verification. Star rating, identity, incentive, sentiment, length alone and photographic polish are not rewarded. Existing records are verified purchases, so verification cannot distinguish them.

The AI receives review text, colours and image bytes, not names, order references, email addresses or star ratings. `store: false` disables Responses API storage, but the provider still processes this content under its data policies; confirm your review privacy disclosures cover that processing. Text/images may themselves contain personal information. Reasons and scores remain server-side.

Scores live separately at `smelt:reviews:v1:{live|test}:ranking:scores`. Source fingerprints include text, photo references, colours, model and rubric version. Changed input is automatically rescored; stale scores are ignored. Photos must be immutable uploads (as in the current review flow). Bump `REVIEW_RUBRIC_VERSION` when changing prompt/product context/weights so existing reviews are rescored consistently.

Published reviews with current scores are ordered highest-first, with submission date then ID breaking ties. Unscored reviews remain visible after scored reviews, newest-first. If no scores are available or score storage fails, all reviews use the existing newest-first order. The UI always offers Most helpful (default) and Most recent; Most recent orders by publication date. Summary ratings always include all published reviews.

The approval hook and cron discover work from published records, so a missed background task is retried without a separate queue. Editing text through any future path also invalidates the fingerprint; cron picks it up. Image-loading or provider errors do not produce partial text-only scores. Retry metadata is separate from review records, and a changed fingerprint bypasses old backoff.
