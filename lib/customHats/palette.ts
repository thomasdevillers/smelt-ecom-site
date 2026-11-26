// Felt colours from the supplier swatch book (public/custom-hats/swatch-book-*.jpg).
// `hex` is the median colour sampled from each swatch photo and tints the hat
// preview; the felt tile (public/custom-hats/felt/<code>.webp) is the real texture.
// Screens vary, so the supplier code is what we order against.

export type FeltFamily = "neutral" | "brown" | "red" | "orange" | "green" | "blue" | "purple";

export interface FeltColour {
  code: string;
  name: string;
  hex: string;
  family: FeltFamily;
}

export const FELT_FAMILIES: Array<{ id: FeltFamily; label: string }> = [
  { id: "neutral", label: "Neutrals" },
  { id: "brown", label: "Browns & tans" },
  { id: "red", label: "Reds & pinks" },
  { id: "orange", label: "Oranges & yellows" },
  { id: "green", label: "Greens" },
  { id: "blue", label: "Blues" },
  { id: "purple", label: "Purples" },
];

export const FELT_COLOURS: FeltColour[] = [
  { code: "L-101", name: "Cream", hex: "#d3c0a0", family: "neutral" },
  { code: "L-103", name: "Ivory", hex: "#c4bbaa", family: "neutral" },
  { code: "L-601", name: "Stone Grey", hex: "#7a7267", family: "neutral" },
  { code: "MIX-603", name: "Heather Grey", hex: "#555250", family: "neutral" },
  { code: "M-603", name: "Pewter", hex: "#4b4741", family: "neutral" },
  { code: "D-608", name: "Charcoal", hex: "#2f2f2f", family: "neutral" },
  { code: "D-606", name: "Graphite", hex: "#22292a", family: "neutral" },
  { code: "D-605", name: "Slate", hex: "#2c3230", family: "neutral" },
  { code: "MIX-612", name: "Midnight Marl", hex: "#252128", family: "neutral" },
  { code: "MIX-410", name: "Black Marl", hex: "#151412", family: "neutral" },
  { code: "D-408", name: "Jet Black", hex: "#131311", family: "neutral" },

  { code: "L-102", name: "Oat", hex: "#a7876e", family: "brown" },
  { code: "L-104", name: "Camel", hex: "#957152", family: "brown" },
  { code: "L-501", name: "Sand", hex: "#907c65", family: "brown" },
  { code: "L-502", name: "Clay", hex: "#7d5d4e", family: "brown" },
  { code: "L-506", name: "Mushroom", hex: "#71564b", family: "brown" },
  { code: "M-504", name: "Taupe", hex: "#675342", family: "brown" },
  { code: "M-507", name: "Cinnamon", hex: "#654129", family: "brown" },
  { code: "M-505", name: "Olive Tan", hex: "#5b4831", family: "brown" },
  { code: "D-511", name: "Cocoa", hex: "#482b26", family: "brown" },
  { code: "D-509", name: "Walnut", hex: "#321f17", family: "brown" },
  { code: "D-513", name: "Mahogany", hex: "#321612", family: "brown" },
  { code: "D-515", name: "Dark Chocolate", hex: "#2c1c19", family: "brown" },
  { code: "D-512", name: "Bitter Chocolate", hex: "#1f0d0b", family: "brown" },
  { code: "MIX-510", name: "Espresso Marl", hex: "#180f0d", family: "brown" },

  { code: "L-203", name: "Coral Pink", hex: "#c56a69", family: "red" },
  { code: "L-202", name: "Dusty Rose", hex: "#905252", family: "red" },
  { code: "L-607", name: "Magenta", hex: "#88184a", family: "red" },
  { code: "M-508", name: "Scarlet", hex: "#97121f", family: "red" },
  { code: "M-207", name: "Crimson", hex: "#77101d", family: "red" },
  { code: "M-206", name: "Raspberry", hex: "#5e0f1d", family: "red" },
  { code: "MIX-210", name: "Burgundy Marl", hex: "#3a0912", family: "red" },
  { code: "M-208", name: "Oxblood", hex: "#300713", family: "red" },

  { code: "L-105", name: "Mustard", hex: "#b67c31", family: "orange" },
  { code: "L-106", name: "Apricot", hex: "#d4803a", family: "orange" },
  { code: "L-108", name: "Tangerine", hex: "#c34110", family: "orange" },
  { code: "M-205", name: "Rust", hex: "#69200f", family: "orange" },
  { code: "D-510", name: "Copper", hex: "#602914", family: "orange" },

  { code: "L-402", name: "Sage", hex: "#5b805d", family: "green" },
  { code: "L-301", name: "Eucalyptus", hex: "#46685d", family: "green" },
  { code: "D-405", name: "Dark Olive", hex: "#1d1f12", family: "green" },
  { code: "D-406", name: "Forest", hex: "#121f18", family: "green" },
  { code: "D-407", name: "Spruce", hex: "#082528", family: "green" },

  { code: "M-305", name: "Ocean", hex: "#0c344e", family: "blue" },
  { code: "D-307", name: "Petrol", hex: "#0b2831", family: "blue" },
  { code: "M-204", name: "Royal Blue", hex: "#19315f", family: "blue" },
  { code: "D-306", name: "Cobalt", hex: "#0d1f45", family: "blue" },
  { code: "D-308", name: "Navy", hex: "#132647", family: "blue" },
  { code: "D-309", name: "Deep Navy", hex: "#0b121c", family: "blue" },
  { code: "D-310", name: "Midnight", hex: "#060912", family: "blue" },
  { code: "D-615", name: "Ink", hex: "#0a0b11", family: "blue" },

  { code: "M-303", name: "Plum", hex: "#592744", family: "purple" },
  { code: "M-304", name: "Violet", hex: "#2f1a37", family: "purple" },
  { code: "D-601", name: "Aubergine", hex: "#23121c", family: "purple" },
];

const byCode = new Map(FELT_COLOURS.map((colour) => [colour.code, colour]));
export const feltColour = (code: string | null | undefined) => (code && byCode.get(code)) || null;
export const feltTile = (code: string) => `/custom-hats/felt/${code.toLowerCase()}.webp`;
export const SWATCH_BOOK_PHOTOS = [1, 2, 3].map((page) => `/custom-hats/swatch-book-${page}.jpg`);
