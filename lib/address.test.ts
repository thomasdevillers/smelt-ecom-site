import { describe, it, expect } from "vitest";
import { sanitizeAddress, isCompleteAddress } from "./address";

describe("address", () => {
  it("trims and keeps known fields", () => {
    const a = sanitizeAddress({
      line1: " 1 Main Rd ", line2: "", city: "Cape Town",
      postalCode: "8001", province: "WC", country: "", phone: "0821234567",
      junk: "x",
    });
    expect(a.line1).toBe("1 Main Rd");
    expect(a.country).toBe("South Africa"); // default
    expect((a as unknown as Record<string, unknown>).junk).toBeUndefined();
  });

  it("flags incomplete addresses", () => {
    expect(isCompleteAddress(sanitizeAddress({ line1: "", city: "", postalCode: "", province: "" }))).toBe(false);
    expect(isCompleteAddress(sanitizeAddress({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC",
    }))).toBe(true);
  });
});
