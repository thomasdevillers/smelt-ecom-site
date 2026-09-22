# Abandoned-cart email automation

The customer sequence is deliberately separate from the existing owner follow-up alert.
For an opted-in lead, the owner alert is labelled as an automated sequence and says not to send a duplicate manual message.

## Customer experience

- The optional checkout checkbox records informed consent for up to three emails about that checkout.
- Email 1 is due after one hour of checkout inactivity.
- Email 2 follows about 23 hours after email 1 (roughly 24 hours after abandonment).
- Email 3 follows about 48 hours later (roughly 72 hours after abandonment) and says it is the final message.
- The first send creates a personal R50 voucher valid for seven days and tied to the opted-in email address.
- The private button restores the saved hat quantities, name, email and voucher. Stock and pre-order capacity are still checked normally before payment.
- Every email links to a confirmation page where the customer can stop the sequence. Unsubscribing does not affect transactional order or shipping emails.

## Safety rules

- Historical Redis leads do not have the new consent fields and are not added to the customer queue. They remain eligible only for the existing owner alert.
- Paystack is checked immediately before every customer email. A successful or reversed transaction permanently stops that campaign; uncertain or pending states are deferred.
- Redis receipts freeze each message body and Resend idempotency keys prevent duplicate sends during retries.
- Ambiguous delivery is not retried after Resend's 24-hour idempotency window; it is marked for manual review instead.
- A reminder that is already about a day overdue is stopped instead of surprising the customer with a stale sequence.
- Recovery tokens expire after 10 days. Voucher records expire after seven days. Unsubscribe suppression is retained separately from cart contents.

## Configuration

Keep `CART_EMAIL_SEQUENCE_ENABLED=false` until the email copy and complete flow have been tested in the intended environment. The sequence also requires `CHECKOUT_FOLLOWUP_ENABLED=true` and the same Redis, Paystack, Resend, sender, site URL and cron configuration used by the existing checkout follow-up system.

Vercel calls `/api/cron/cart-emails` every 10 minutes. Enabling the flag does not backfill older leads; only a new checkout capture with the checkbox selected can enter the sequence.
