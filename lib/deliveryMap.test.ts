import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DeliveryMap from "@/components/DeliveryMap";
import { getDeliveryMap, type DeliveryAddress } from "./deliveryMap";

const address: DeliveryAddress = {
  line1: "285 Beach Road", suburb: "Sea Point", city: "Cape Town",
  province: "Western Cape", postalCode: "8060", country: "South Africa",
  lat: -33.916, lng: 18.386, placeId: "test-place-id",
};

afterEach(() => vi.unstubAllEnvs());

describe("delivery map", () => {
  it("uses the checkout-selected place for the pin and centers on its coordinates", () => {
    const map = getDeliveryMap(address, "test-key");
    const embed = new URL(map.embedUrl!);
    expect(embed.searchParams.get("q")).toBe("place_id:test-place-id");
    expect(embed.searchParams.get("center")).toBe("-33.916,18.386");
    expect(new URL(map.mapsUrl).searchParams.get("query_place_id")).toBe("test-place-id");
  });

  it("looks up manual addresses without adding unit or company details to the map query", () => {
    const manual = { ...address, placeId: undefined, lat: undefined, lng: undefined,
      line1: "12 Main & Side Road", company: "Oak Estate", addressLine2: "Unit 4" };
    const map = getDeliveryMap(manual, "test-key");
    const query = new URL(map.embedUrl!).searchParams.get("q");
    expect(query).toBe("12 Main & Side Road, Sea Point, Cape Town, Western Cape, 8060, South Africa");
    expect(map.addressLines.slice(0, 3)).toEqual(["Oak Estate", "Unit 4", "12 Main & Side Road"]);
  });

  it("falls back to the address for invalid coordinates and accepts zero coordinates", () => {
    for (const [lat, lng] of [[Infinity, 18], [-91, 18], [-33, 181]]) {
      const embed = new URL(getDeliveryMap({ ...address, placeId: undefined, lat, lng }, "test-key").embedUrl!);
      expect(embed.searchParams.has("center")).toBe(false);
      expect(embed.searchParams.get("q")).toContain("285 Beach Road");
    }
    const embed = new URL(getDeliveryMap({ ...address, placeId: undefined, lat: 0, lng: 0 }, "test-key").embedUrl!);
    expect(embed.searchParams.get("q")).toBe("0,0");
  });

  it("does not repeat locality after the courier's full formatted address", () => {
    const full = "285 Beach Road, Sea Point, Cape Town, 8060, South Africa";
    expect(getDeliveryMap({ ...address, line1: full, formattedAddress: full }).addressLines).toEqual([full]);
  });

  it.each([undefined, "false", "TRUE"])("keeps the iframe disabled for flag %s while showing address and link", (flag) => {
    vi.stubEnv("NEXT_PUBLIC_DELIVERY_MAP_ENABLED", flag);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    const html = renderToStaticMarkup(createElement(DeliveryMap, { address }));
    expect(html).not.toContain("<iframe");
    expect(html).toContain("285 Beach Road");
    expect(html).toContain("View in Google Maps");
    expect(html).not.toContain("test-key");
  });

  it("renders the lazy map only when the flag is true and a key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DELIVERY_MAP_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    const html = renderToStaticMarkup(createElement(DeliveryMap, { address }));
    expect(html).toContain("<iframe");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    expect(renderToStaticMarkup(createElement(DeliveryMap, { address }))).not.toContain("<iframe");
  });
});
