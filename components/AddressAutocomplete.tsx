"use client";

import { useEffect, useRef, useState } from "react";

export interface ParsedPlaceAddress {
  line1: string;
  line2?: string;
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

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

declare global {
  interface Window {
    google?: any;
    __googleMapsLoadingPromise__?: Promise<void>;
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (window.__googleMapsLoadingPromise__) {
    return window.__googleMapsLoadingPromise__;
  }

  window.__googleMapsLoadingPromise__ = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", (e) => reject(e));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return window.__googleMapsLoadingPromise__;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  className,
  placeholder = "Start typing your street address…",
  required,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return;

    let isMounted = true;

    loadGoogleMapsScript(GOOGLE_MAPS_KEY)
      .then(() => {
        if (!isMounted || !inputRef.current || !window.google?.maps?.places) return;

        setIsLoaded(true);

        if (!autocompleteRef.current) {
          const autocomplete = new window.google.maps.places.Autocomplete(
            inputRef.current,
            {
              types: ["address"],
              componentRestrictions: { country: ["za"] },
              fields: ["address_components", "geometry", "place_id", "formatted_address"],
            }
          );

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (!place || !place.address_components) return;

            let streetNumber = "";
            let route = "";
            let sublocality = "";
            let locality = "";
            let province = "";
            let postalCode = "";
            let country = "South Africa";

            for (const component of place.address_components) {
              const types = component.types as string[];
              if (types.includes("street_number")) {
                streetNumber = component.long_name;
              } else if (types.includes("route")) {
                route = component.long_name;
              } else if (
                types.includes("sublocality") ||
                types.includes("sublocality_level_1") ||
                types.includes("neighborhood")
              ) {
                sublocality = component.long_name;
              } else if (
                types.includes("locality") ||
                types.includes("postal_town") ||
                types.includes("administrative_area_level_2")
              ) {
                if (!locality) locality = component.long_name;
              } else if (types.includes("administrative_area_level_1")) {
                province = component.long_name;
              } else if (types.includes("postal_code")) {
                postalCode = component.long_name;
              } else if (types.includes("country")) {
                country = component.long_name;
              }
            }

            const line1 = [streetNumber, route].filter(Boolean).join(" ") || place.formatted_address || "";
            const lat = place.geometry?.location?.lat ? place.geometry.location.lat() : undefined;
            const lng = place.geometry?.location?.lng ? place.geometry.location.lng() : undefined;

            onPlaceSelect({
              line1,
              line2: sublocality || undefined,
              city: locality,
              province,
              postalCode,
              country,
              lat,
              lng,
              placeId: place.place_id || undefined,
            });
          });

          autocompleteRef.current = autocomplete;
        }
      })
      .catch((err) => {
        console.warn("Failed to load Google Maps Places Autocomplete script:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      className={className}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={GOOGLE_MAPS_KEY ? placeholder : "12 Loop Street"}
      required={required}
      autoComplete="street-address"
    />
  );
}
