export interface ShippingAddress {
  line1: string;
  line2?: string;
  buildingName?: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  phone?: string;
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
    line2: str(c.line2) || undefined,
    buildingName: str(c.buildingName) || undefined,
    city: str(c.city),
    postalCode: str(c.postalCode),
    province: str(c.province),
    country: str(c.country) || "South Africa",
    phone: str(c.phone) || undefined,
    lat: num(c.lat),
    lng: num(c.lng),
    placeId: str(c.placeId) || undefined,
  };
}

export function isCompleteAddress(a: ShippingAddress): boolean {
  return Boolean(a.line1 && a.city && a.postalCode && a.province);
}
