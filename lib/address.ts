export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  phone?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function sanitizeAddress(input: unknown): ShippingAddress {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    line1: str(c.line1),
    line2: str(c.line2) || undefined,
    city: str(c.city),
    postalCode: str(c.postalCode),
    province: str(c.province),
    country: str(c.country) || "South Africa",
    phone: str(c.phone) || undefined,
  };
}

export function isCompleteAddress(a: ShippingAddress): boolean {
  return Boolean(a.line1 && a.city && a.postalCode && a.province);
}
