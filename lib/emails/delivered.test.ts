import { describe, it, expect } from "vitest";
import { deliveredEmail } from "./delivered";

describe("deliveredEmail", () => {
  it("has a landed/delivered subject", () => {
    expect(deliveredEmail({ name: "Sam" }).subject).toMatch(/landed|delivered/i);
  });
  it("greets by name when present and works without one", () => {
    expect(deliveredEmail({ name: "Sam" }).html).toContain("Sam");
    expect(deliveredEmail({}).html).toContain("Hi there,");
  });
});
