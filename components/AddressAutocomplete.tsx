"use client";

import { useEffect, useRef, useState } from "react";

export interface ParsedPlaceAddress {
  line1: string;
  // The full Google-formatted address (e.g. "285 Beach Road, Sea Point, Cape
  // Town, 8005, South Africa") — not shown to the customer, but paste-ready
  // for Aramex's "Receiver's Street Address" field. Used to build the
  // Paystack payload's line1 instead of the short street-only value.
  formattedAddress?: string;
  suburb?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onPlaceSelect: (parsed: ParsedPlaceAddress) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

interface PredictionItem {
  place_id: string;
  main_text: string;
  secondary_text: string;
  raw: any;
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    google?: any;
  }
}

// A plain <script src="...&loading=async"> tag does NOT define
// google.maps.importLibrary — that function only exists once Google's
// "dynamic library import" bootstrap stub has been installed *before* the
// real API script loads. This installs that stub (Google's documented
// pattern: https://developers.google.com/maps/documentation/javascript/load-maps-js-api#dynamic-library-import),
// which queues importLibrary() calls, injects the real script with a
// `callback` param (the actual readiness signal — more reliable than
// script.onload, which can fire before async init finishes), and once that
// callback fires, importLibrary is replaced by the API's real implementation.
function ensureGoogleMapsBootstrap(apiKey: string) {
  if (window.google?.maps?.importLibrary) return;

  const google = (window.google = window.google || {});
  const maps = (google.maps = google.maps || {});
  const requestedLibraries = new Set<string>();
  let loadPromise: Promise<void> | undefined;

  const loadScript = () =>
    loadPromise ||
    (loadPromise = new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        libraries: [...requestedLibraries].join(","),
        callback: "google.maps.__ib__",
      });
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      maps.__ib__ = resolve;
      script.onerror = () => reject(new Error("Google Maps JavaScript API could not load."));
      document.head.appendChild(script);
    }));

  maps.importLibrary = (library: string, ...rest: unknown[]) => {
    requestedLibraries.add(library);
    return loadScript().then(() => window.google.maps.importLibrary(library, ...rest));
  };
}

function loadPlacesLibrary(apiKey: string): Promise<any> {
  ensureGoogleMapsBootstrap(apiKey);
  return window.google.maps.importLibrary("places");
}

function parseComponents(components: any[], fallbackAddress?: string) {
  let streetNumber = "";
  let route = "";
  let sublocality = "";
  let locality = "";
  let province = "";
  let postalCode = "";
  let country = "South Africa";

  for (const component of components) {
    const types = (component.types || []) as string[];
    const name = component.longText || component.long_name || component.name || "";
    if (types.includes("street_number")) {
      streetNumber = name;
    } else if (types.includes("route")) {
      route = name;
    } else if (
      types.includes("sublocality") ||
      types.includes("sublocality_level_1") ||
      types.includes("neighborhood")
    ) {
      sublocality = name;
    } else if (
      types.includes("locality") ||
      types.includes("postal_town") ||
      types.includes("administrative_area_level_2")
    ) {
      if (!locality) locality = name;
    } else if (types.includes("administrative_area_level_1")) {
      province = name;
    } else if (types.includes("postal_code")) {
      postalCode = name;
    } else if (types.includes("country")) {
      country = name;
    }
  }

  const line1 = [streetNumber, route].filter(Boolean).join(" ") || fallbackAddress || "";
  return {
    streetNumber,
    route,
    sublocality,
    locality,
    province,
    postalCode,
    country,
    line1,
    formattedAddress: fallbackAddress,
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  className,
  placeholder = "12 Loop Street",
  required,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceTimer = useRef<any>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPredictions = (query: string) => {
    if (!GOOGLE_MAPS_KEY || !query.trim() || query.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    loadPlacesLibrary(GOOGLE_MAPS_KEY)
      .then(async (placesLib) => {
        if (!placesLib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          console.error(
            "Places API (New) is unavailable — enable it for this project in Google Cloud Console."
          );
          setPredictions([]);
          setIsOpen(false);
          return;
        }

        try {
          const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            includedRegionCodes: ["za"],
          });
          const items: PredictionItem[] = (res.suggestions || []).map((s: any) => {
            const placePrediction = s.placePrediction;
            return {
              place_id: placePrediction?.placeId || placePrediction?.place,
              main_text:
                placePrediction?.text?.text ||
                placePrediction?.structuredFormat?.mainText?.text ||
                "",
              secondary_text:
                placePrediction?.structuredFormat?.secondaryText?.text || "",
              raw: s,
            };
          });
          setPredictions(items);
          setIsOpen(items.length > 0);
        } catch (e) {
          console.error("Places autocomplete request failed:", e);
          setPredictions([]);
          setIsOpen(false);
        }
      })
      .catch((err) => console.warn("Google Maps script load error:", err));
  };

  const handleInputChange = (text: string) => {
    onChange(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchPredictions(text);
    }, 250);
  };

  const handleSelectPrediction = (item: PredictionItem) => {
    setIsOpen(false);

    loadPlacesLibrary(GOOGLE_MAPS_KEY!)
      .then(async (placesLib) => {
        if (!placesLib?.Place) {
          console.error(
            "Places API (New) is unavailable — enable it for this project in Google Cloud Console."
          );
          return;
        }

        try {
          const place = item.raw?.placePrediction?.toPlace
            ? item.raw.placePrediction.toPlace()
            : new placesLib.Place({ id: item.place_id });

          await place.fetchFields({
            fields: ["addressComponents", "location", "id", "formattedAddress"],
          });

          const rawComponents = place.addressComponents || [];
          const parsed = parseComponents(rawComponents, place.formattedAddress);
          const lat = place.location?.lat ? place.location.lat() : undefined;
          const lng = place.location?.lng ? place.location.lng() : undefined;

          onPlaceSelect({
            line1: parsed.line1,
            formattedAddress: parsed.formattedAddress,
            suburb: parsed.sublocality || undefined,
            city: parsed.locality,
            province: parsed.province,
            postalCode: parsed.postalCode,
            country: parsed.country,
            lat,
            lng,
            placeId: place.id || item.place_id,
          });
        } catch (e) {
          console.error("Place details request failed:", e);
        }
      })
      .catch((err) => console.warn("Fetch place detail error:", err));
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        className={className}
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />

      {isOpen && predictions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "var(--paper, #fbf7f0)",
            border: "var(--border-ink-soft, 1px solid rgba(14, 59, 42, 0.2))",
            borderRadius: "14px",
            boxShadow: "0 10px 28px rgba(14, 59, 42, 0.14)",
            zIndex: 1000,
            overflow: "hidden",
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {predictions.map((item, idx) => (
            <button
              key={item.place_id || idx}
              type="button"
              onClick={() => handleSelectPrediction(item)}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 16px",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderBottom:
                  idx === predictions.length - 1 ? "none" : "1px solid rgba(14, 59, 42, 0.08)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(14, 59, 42, 0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "var(--ink, #0e3b2a)",
                  lineHeight: 1.3,
                }}
              >
                {item.main_text}
              </div>
              {item.secondary_text && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "rgba(14, 59, 42, 0.65)",
                    marginTop: "2px",
                  }}
                >
                  {item.secondary_text}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
