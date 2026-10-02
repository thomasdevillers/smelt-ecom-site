export const HAT_QUESTION_MAX_LENGTH = 600;
export const HAT_HISTORY_MAX_MESSAGES = 9;

export const HAT_QUESTION_STARTERS = [
  "Will it fit me?",
  "How do I clean it?",
  "What are my delivery options?",
] as const;

export const HAT_SOURCES = {
  product: { label: "Hat details", href: "/product" },
  fit: { label: "Fit & sizing", href: "/product#faq" },
  care: { label: "Care guide", href: "/care" },
  shipping: { label: "Delivery", href: "/policies" },
  returns: { label: "Returns policy", href: "/policies#returns-policy" },
  pricing: { label: "Price & bundles", href: "/product" },
  availability: { label: "Current availability", href: "/product" },
  contact: { label: "Contact Smelt", href: "/contact" },
} as const;

export type HatSourceId = keyof typeof HAT_SOURCES;
export type HatMessage = { role: "user" | "assistant"; content: string };
export type HatAnswer = { answer: string; sources: HatSourceId[]; needsHuman: boolean };

export function isHatSource(value: unknown): value is HatSourceId {
  return typeof value === "string" && Object.hasOwn(HAT_SOURCES, value);
}

/** Bound history and reject client-supplied system/tool messages. */
export function parseHatMessages(input: unknown): HatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > HAT_HISTORY_MAX_MESSAGES
    || input.length % 2 === 0) return null;
  const messages: HatMessage[] = [];
  let length = 0;
  for (const [index, value] of input.entries()) {
    if (!value || typeof value !== "object") return null;
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (value.role !== expectedRole || typeof value.content !== "string") return null;
    const content = value.content.trim();
    const max = expectedRole === "user" ? HAT_QUESTION_MAX_LENGTH : 2400;
    if (!content || content.length > max) return null;
    length += content.length;
    if (length > 9000) return null;
    messages.push({ role: expectedRole, content });
  }
  return messages;
}

export function parseHatAnswer(input: unknown): HatAnswer | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.answer !== "string" || !value.answer.trim() || value.answer.length > 2400
    || !Array.isArray(value.sources) || value.sources.length > 4
    || !value.sources.every(isHatSource) || typeof value.needsHuman !== "boolean") return null;
  // An unsupported question can be handed to the founders, but factual answers need a source.
  if (!value.sources.length && !value.needsHuman) return null;
  return { answer: value.answer.trim(), sources: [...new Set(value.sources)], needsHuman: value.needsHuman };
}
