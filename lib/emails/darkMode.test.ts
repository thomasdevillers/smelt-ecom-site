import { describe, expect, it } from "vitest";
import { abandonedCartEmail } from "./abandonedCart";
import { cartRecoveryEmail } from "./cartRecovery";
import { deliveredEmail } from "./delivered";
import { orderConfirmationEmail } from "./orderConfirmation";
import { ownerAlertEmail } from "./ownerAlert";
import { paymentFailedEmail } from "./paymentFailed";
import { reviewRequestEmail } from "./reviewRequest";
import { reviewRewardEmail } from "./reviewReward";
import { shippingEmail } from "./shipping";
import { welcomeEmail } from "./welcome";

const items = [{ colour: "green", name: "Forest Green", qty: 1 }];
const address = {
  line1: "1 Main Road", suburb: "Sea Point", city: "Cape Town",
  postalCode: "8005", province: "Western Cape", country: "South Africa",
};
const voucher = { code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-12-21T10:00:00.000Z" };

const emails = [
  abandonedCartEmail({ name: "Tumi", items, total: "R540", cartUrl: "https://saunahat.co.za/cart" }),
  cartRecoveryEmail({ step: 0, name: "Tumi", items, recoveryUrl: "https://saunahat.co.za/checkout", unsubscribeUrl: "https://saunahat.co.za/email/unsubscribe/token", voucher }),
  deliveredEmail({ name: "Tumi" }),
  orderConfirmationEmail({ reference: "SMELT-1", total: "R540", items, address, shippingMethod: "aramex" }),
  ownerAlertEmail({ reference: "SMELT-1", email: "buyer@example.com", total: "R540", items, address }),
  paymentFailedEmail({ items, retryUrl: "https://saunahat.co.za/checkout" }),
  reviewRequestEmail({ name: "Tumi", reviewUrl: "https://saunahat.co.za/review/token" }),
  reviewRewardEmail({ name: "Tumi", voucher }),
  shippingEmail({ name: "Tumi", trackingNumber: "1234567890", items }),
  welcomeEmail(),
];

describe("shared email colour modes", () => {
  it.each(emails.map((email) => [email.subject, email.html]))("applies the Smelt light and dark palette to %s", (_subject, html) => {
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("@media (prefers-color-scheme:dark)");
    expect(html).toContain('class="email-body"');
    expect(html).toContain('class="email-card email-text"');
    expect(html).toContain("background-color:#F6F1E3");
    expect(html).toContain("background-color:#123D2E!important");
    expect(html).toContain("color:#D8D1BF!important");
  });

  it("keeps the primary light-mode CTA forest green instead of brown", () => {
    const withCta = emails.filter((email) => email.html.includes('class="email-cta"'));
    expect(withCta.length).toBeGreaterThan(0);
    for (const email of withCta) {
      expect(email.html).toContain('bgcolor="#0E3B2A"');
      expect(email.html).not.toContain('class="email-cta-cell" bgcolor="#E4633C"');
    }
  });
});
