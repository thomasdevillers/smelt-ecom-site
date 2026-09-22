import { describe, expect, it } from "vitest";
import { reviewRequestEmail } from "./reviewRequest";
import { reviewRewardEmail } from "./reviewReward";

describe("review emails", () => {
  it("asks for an honest review without tying the reward to a positive rating", () => {
    const email = reviewRequestEmail({ name: "Tumi <Customer>", reviewUrl: "https://saunahat.co.za/review/private-token" });
    expect(email.subject).toContain("R50");
    expect(email.html).toContain("Hi Tumi,");
    expect(email.html).toContain("good, bad, or somewhere in between");
    expect(email.text).toContain("Every rating qualifies");
    expect(email.text).toContain("https://saunahat.co.za/review/private-token");
  });

  it("delivers the exact voucher and 90-day expiry information", () => {
    const email = reviewRewardEmail({ voucher: { code: "SMELT-ABCDEFGHIJKL", amount: 50, expiresAt: "2026-12-21T10:00:00.000Z" } });
    expect(email.subject).toContain("R50");
    expect(email.html).toContain("SMELT-ABCDEFGHIJKL");
    expect(email.text).toContain("regardless of the rating");
    expect(email.text).toContain("21 December 2026");
  });
});
