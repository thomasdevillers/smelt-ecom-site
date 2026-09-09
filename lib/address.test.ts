import { describe, it, expect } from "vitest";
import { sanitizeAddress, isCompleteAddress } from "./address";

describe("address", () => {
  it("trims and keeps known fields", () => {
    const a = sanitizeAddress({
      line1: " 1 Main Rd ", suburb: "", company: " Oak Estate ", city: "Cape Town",
      postalCode: "8001", province: "WC", country: "", phone: "0821234567",
      junk: "x",
    });
    expect(a.line1).toBe("1 Main Rd");
    expect(a.company).toBe("Oak Estate");
    expect(a.country).toBe("South Africa"); // default
    expect((a as unknown as Record<string, unknown>).junk).toBeUndefined();
  });

  it("sanitizes optional geolocation coordinates and placeId", () => {
    const a = sanitizeAddress({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC",
      lat: -33.9249, lng: 18.4241, placeId: "ChIJb8u5070zzB0R2g",
    });
    expect(a.lat).toBe(-33.9249);
    expect(a.lng).toBe(18.4241);
    expect(a.placeId).toBe("ChIJb8u5070zzB0R2g");
  });

  it("keeps the manual Aramex fields separate from the autofilled ones", () => {
    const a = sanitizeAddress({
      line1: "285 Beach Road", suburb: "Sea Point", city: "Cape Town",
      postalCode: "8060", province: "Western Cape",
      addressLine2: "Unit 4", company: "Seaside Business Park",
    });
    expect(a.suburb).toBe("Sea Point");
    expect(a.addressLine2).toBe("Unit 4");
    expect(a.company).toBe("Seaside Business Park");
  });

  it("flags incomplete addresses", () => {
    expect(isCompleteAddress(sanitizeAddress({ line1: "", city: "", postalCode: "", province: "" }))).toBe(false);
    expect(isCompleteAddress(sanitizeAddress({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001", province: "WC",
    }))).toBe(true);
  });
});
