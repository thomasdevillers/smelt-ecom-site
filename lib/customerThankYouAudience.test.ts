import { describe, expect, it } from "vitest";
import { customerThankYouAudience } from "./customerThankYouAudience";

describe("completed-customer campaign audience", () => {
  it("deduplicates normalized addresses and includes buyers who also have active orders", () => {
    const { customers } = customerThankYouAudience([
      { reference: "active", email: "buyer@example.com", name: "Buyer", completedAt: null },
      { reference: "two", email: " BUYER@Example.com ", name: "Buyer", completedAt: "2026-11-02" },
      { reference: "one", email: "buyer@example.com", name: "Buyer", completedAt: "2026-11-01" },
      { reference: "other", email: "activeonly@example.com", name: "Active", completedAt: null },
    ]);
    expect(customers).toEqual([{ email: "buyer@example.com", name: "Buyer", references: ["one", "two"] }]);
  });
  it("excludes invalid addresses and orders without completion", () => {
    expect(customerThankYouAudience([
      { reference: "one", email: "a@example.com,b@example.com", name: "Buyer", completedAt: "2026-11-01" },
      { reference: "two", email: "a@example.com", name: "Buyer", completedAt: null },
    ])).toEqual({ customers: [], invalidEmails: 1 });
  });
});
