import { describe, it, expect } from "vitest";
import { welcomeEmail } from "./welcome";

describe("welcomeEmail", () => {
  const e = welcomeEmail();
  it("has a warm-regards subject", () => {
    expect(e.subject).toMatch(/warm regards/i);
  });
  it("links to the product page", () => {
    expect(e.html).toContain("/product");
  });
});
