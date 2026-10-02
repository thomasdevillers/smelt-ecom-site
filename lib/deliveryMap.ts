import { sanitizeAddress, type ShippingAddress } from "./address";

export type DeliveryAddress = Omit<ShippingAddress, "phone">;

/** Return only the delivery fields needed by the confirmation page. */
export function getDeliveryAddress(input: unknown): DeliveryAddress | null {
  const address = sanitizeAddress(input);
  if (!address.line1) return null;

  return {
    line1: address.line1,
    formattedAddress: address.formattedAddress,
    addressLine2: address.addressLine2,
    company: address.company,
    suburb: address.suburb,
    city: address.city,
    postalCode: address.postalCode,
    province: address.province,
    country: address.country,
    lat: address.lat,
    lng: address.lng,
    placeId: address.placeId,
  };
}

export function getDeliveryMap(address: DeliveryAddress, apiKey?: string) {
  const hasCoordinates = typeof address.lat === "number" && Number.isFinite(address.lat)
    && Math.abs(address.lat) <= 90 && typeof address.lng === "number"
    && Number.isFinite(address.lng) && Math.abs(address.lng) <= 180;
  const coordinates = hasCoordinates ? `${address.lat},${address.lng}` : undefined;
  const locality = [address.suburb, address.city, address.province, address.postalCode]
    .filter(Boolean).join(", ");
  // Checkout stores Google's full formatted address in line1 for the courier.
  // Avoid repeating the city/province beneath that same address.
  const hasFullAddress = Boolean(address.formattedAddress)
    || Boolean(address.city && address.line1.split(",")
      .some((part) => part.trim().toLowerCase() === address.city.toLowerCase()));
  const fullAddress = address.formattedAddress || (hasFullAddress ? address.line1
    : [address.line1, locality, address.country].filter(Boolean).join(", "));
  const addressLines = [
    address.company,
    address.addressLine2,
    address.formattedAddress || address.line1,
    !hasFullAddress ? locality : undefined,
    !hasFullAddress ? address.country : undefined,
  ].filter((line): line is string => Boolean(line));

  const mapsUrl = new URL("https://www.google.com/maps/search/");
  mapsUrl.search = new URLSearchParams({
    api: "1",
    query: coordinates || fullAddress,
    ...(address.placeId ? { query_place_id: address.placeId } : {}),
  }).toString();

  let embedUrl: string | undefined;
  if (apiKey) {
    const embed = new URL("https://www.google.com/maps/embed/v1/place");
    embed.search = new URLSearchParams({
      key: apiKey,
      q: address.placeId ? `place_id:${address.placeId}` : coordinates || fullAddress,
      zoom: "16",
      region: "ZA",
      language: "en",
      ...(coordinates ? { center: coordinates } : {}),
    }).toString();
    embedUrl = embed.toString();
  }

  return { addressLines, mapsUrl: mapsUrl.toString(), embedUrl };
}
