import { afterEach, describe, expect, it, vi } from "vitest";
const salesMode = vi.hoisted(() => ({ preorder: true }));
vi.mock("../salesMode", async (original) => ({
  ...await original<typeof import("../salesMode")>(),
  get PREORDER_MODE() { return salesMode.preorder; },
}));
afterEach(() => { salesMode.preorder = true; });

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
    expect(email.subject).toMatch(/pre-order/i);
    for (const content of [email.html, email.text]) {
      expect(content).toContain("not stock ready for immediate dispatch");
      expect(content).toContain("Expected 15 October. Delivery follows arrival.");
      expect(content).toContain("R450 per hat");
      expect(content).toContain("regular price R550");
      expect(content).toContain("Payment is taken in full");
      expect(content).toContain("Complete my pre-order");
      expect(content).toContain("discount automatically");
      expect(content).toContain("Expires 29 September 2026");
      expect(content).not.toContain("Current stock");
    }
    expect(email.html).toContain("Forest Green");
    expect(email.html).toContain("SMELT-ABCDEFGHIJKL");
    expect(email.text).toContain(input.recoveryUrl);
    expect(email.text).toContain("Stop these emails");
    expect(email.html).toContain(input.unsubscribeUrl);
    expect(email.html).not.toContain("Tumi &lt;Customer&gt;");
  });

  it.each([0, 1, 2] as const)("returns to standard recovery copy when pre-orders end, step %s", (step) => {
    salesMode.preorder = false;
    const email = cartRecoveryEmail({ ...input, step });
    expect(email.subject).not.toContain("pre-order");
    expect(email.text).not.toContain("15 October");
    expect(email.text).not.toContain("R450");
    expect(email.text).toContain("Return to my checkout");
    expect(email.text).toContain("Current stock is confirmed again before payment.");
  });

  it("makes the final message explicitly final", () => {
    expect(cartRecoveryEmail({ ...input, step: 2 }).text).toContain("last email");
  });
});
