export interface ShippingAddress {
  line1: string;
  // Full Google-formatted address, captured alongside line1 but never shown
  // to the customer — used in place of line1 only for the payload sent to
  // Paystack, so it's paste-ready for Aramex's "Street Address" field.
  formattedAddress?: string;
  suburb?: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  phone?: string;
  // Manual, Aramex-specific fields — never populated by Google autofill.
  addressLine2?: string; // Aramex "Street Address Line 2": unit/floor/complex
  company?: string; // Aramex "Company Name / Business Park / Estate"
  lat?: number;
  lng?: number;
  placeId?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : undefined);

export function sanitizeAddress(input: unknown): ShippingAddress {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    line1: str(c.line1),
    formattedAddress: str(c.formattedAddress) || undefined,
    suburb: str(c.suburb) || undefined,
    city: str(c.city),
    postalCode: str(c.postalCode),
    province: str(c.province),
    country: str(c.country) || "South Africa",
    phone: str(c.phone) || undefined,
    addressLine2: str(c.addressLine2) || undefined,
    company: str(c.company) || undefined,
    lat: num(c.lat),
    lng: num(c.lng),
    placeId: str(c.placeId) || undefined,
  };
}

export function isCompleteAddress(a: ShippingAddress): boolean {
  return Boolean(a.line1 && a.city && a.postalCode && a.province);
}
