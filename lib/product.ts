export type Colour = "green" | "cream";
export type Face = "front" | "back";

export interface Variant {
  colour: Colour;
  name: string;        // "Forest Green"
  swatch: string;      // hex for the colourway dot
  images: Record<Face, string>;  // transparent-bg product shots
}

export const PRODUCT = {
  name: "Smelt Sauna Hat",
  tagline: "100% wool felt. Embroidered, not printed.",
  variants: {
    green: {
      colour: "green",
      name: "Forest Green",
      swatch: "#0E3B2A",
      images: {
        front: "/images/hat-green-front-nobg.png",
        back: "/images/hat-green-back-nobg.png",
      },
    },
    cream: {
      colour: "cream",
      name: "Natural Cream",
      swatch: "#EFE4C4",
      images: {
        front: "/images/hat-cream-front-nobg.png",
        back: "/images/hat-cream-back-nobg.png",
      },
    },
  } as Record<Colour, Variant>,
} as const;

export const COLOURS: Colour[] = ["green", "cream"];

export function faceLabel(face: Face): string {
  return face === "front" ? 'front · "Smelt"' : 'back · "Warm regards"';
}
