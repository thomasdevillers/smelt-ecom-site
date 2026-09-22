import { describe, expect, it } from "vitest";
import { cartRecoveryEmail } from "./cartRecovery";

const input = {
  name: "Tumi <Customer>",
  items: [{ colour: "green", name: "Forest Green", qty: 1 }],
  recoveryUrl: "https://saunahat.co.za/checkout/recover/private-token",
  unsubscribeUrl: "https://saunahat.co.za/email/unsubscribe/private-token",
  voucher: { code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-09-29T10:00:00.000Z" },
};

describe("cart recovery emails", () => {
  it.each([0, 1, 2] as const)("renders step %s with the cart, offer and opt-out", (step) => {
    const email = cartRecoveryEmail({ ...input, step });
    expect(email.subject).toMatch(/R50|cart/i);
    expect(email.html).toContain("Forest Green");
    expect(email.html).toContain("SMELT-ABCDEFGHIJKL");
    expect(email.text).toContain(input.recoveryUrl);
    expect(email.text).toContain("Stop these emails");
    expect(email.html).toContain(input.unsubscribeUrl);
    expect(email.html).not.toContain("Tumi &lt;Customer&gt;");
  });

  it("makes the final message explicitly final", () => {
    expect(cartRecoveryEmail({ ...input, step: 2 }).text).toContain("last email");
  });
});
