import { describe, expect, it } from "vitest";
import { cartRecoveryEmail } from "./cartRecovery";
import { welcomeEmail } from "./welcome";
import { reviewRewardEmail } from "./reviewReward";
import { captureTouch } from "../attribution";

const voucher = { code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-11-01T10:00:00Z" };
describe("marketing email attribution", () => {
  it.each([
    ["welcome", () => welcomeEmail(), "/product"],
    ["review_reward", () => reviewRewardEmail({ voucher }), "/checkout/offer/SMELT-ABCDEFGHIJKL"],
    ["cart_recovery", () => cartRecoveryEmail({ step: 1, items: [{ colour: "cream", name: "Natural Cream", qty: 1 }], recoveryUrl: "https://saunahat.co.za/checkout/recover/private-token", unsubscribeUrl: "https://saunahat.co.za/email/unsubscribe/private-token", voucher }), "/checkout/recover/private-token"],
  ] as const)("tags the %s shopping link and preserves working HTML and plain-text URLs", (campaign, create, path) => {
    const email = create();
    const htmlLink = email.html.match(/class="email-cta" href="([^"]+)"/)![1];
    const rawLink = htmlLink.replace(/&amp;/g, "&");
    const url = new URL(rawLink);
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("utm_campaign")).toBe(campaign);
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(htmlLink).toContain("&amp;");
    expect(email.text).toContain(rawLink);
    expect(email.text).not.toContain("&amp;");
    const touch = captureTouch(url, "")!;
    expect(touch.source).toBe("smelt");
    expect(JSON.stringify(touch)).not.toMatch(/private-token|SMELT-ABCDEFGHIJKL/);
    if (campaign === "cart_recovery") {
      expect(url.searchParams.get("utm_content")).toBe("step_2");
      expect(email.html).toContain('href="https://saunahat.co.za/email/unsubscribe/private-token"');
    }
  });
});
