// Custom hat requests: data shapes and validation shared by the designer page,
// the API and the admin panel. Safe to import in client components.
import { feltColour } from "./palette";

export const CUSTOM_HAT_MAX_DESIGNS = 30;
export const CUSTOM_HAT_MAX_QUANTITY = 10_000;
export const CUSTOM_HAT_TAG_MAX = 24;
export const CUSTOM_HAT_NOTES_MAX = 600;
export const CUSTOM_HAT_MAX_UPLOADS = 80;
export const CUSTOM_HAT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const CUSTOM_HAT_FILE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};
export const CUSTOM_HAT_FILE_ACCEPT = Object.keys(CUSTOM_HAT_FILE_TYPES).join(",");
export const CUSTOM_HAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export type LogoSide = "front" | "back";

export interface LogoPlacement {
  enabled: boolean;
  /** R2 object key of the uploaded artwork. */
  fileKey: string | null;
  fileName: string | null;
  fileType: string | null;
  notes: string;
}

export interface HatDesign {
  id: string;
  colour: string | null;
  quantity: number;
  front: LogoPlacement;
  back: LogoPlacement;
  tag: { enabled: boolean; text: string };
  notes: string;
}

export interface CustomHatContact {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export interface CustomHatSubmission {
  contact: CustomHatContact;
  notes: string;
  hats: HatDesign[];
}

/** What the customer page receives. Never includes other customers' data. */
export interface CustomHatInvite {
  valid: boolean;
  error?: string;
  customer?: { name: string; email: string; phone: string };
  submission?: CustomHatSubmission | null;
  submittedAt?: string | null;
  /** Short-lived preview links for artwork already uploaded to this request. */
  files?: Record<string, string>;
  uploadsEnabled?: boolean;
}

export interface AdminCustomHatRequest {
  id: string;
  url: string;
  customer: { name: string; email: string; phone: string };
  createdAt: string;
  submittedAt: string | null;
  revision: number;
  submission: CustomHatSubmission | null;
  files: Record<string, string>;
}

export const emptyPlacement = (): LogoPlacement => ({
  enabled: false,
  fileKey: null,
  fileName: null,
  fileType: null,
  notes: "",
});
export const newHatDesign = (id: string, colour: string | null = null): HatDesign => ({
  id,
  colour,
  quantity: 10,
  front: emptyPlacement(),
  back: emptyPlacement(),
  tag: { enabled: false, text: "" },
  notes: "",
});

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const longText = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export class CustomHatValidationError extends Error {}

export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/**
 * Cleans a submission from the browser. `ownsFile` confirms an artwork key was
 * issued to this request, so a submission cannot reference other customers' files.
 */
export function validateSubmission(
  raw: unknown,
  ownsFile: (key: string) => boolean,
): CustomHatSubmission {
  const input = record(raw);
  const contactInput = record(input.contact);
  const contact: CustomHatContact = {
    name: text(contactInput.name, 120),
    company: text(contactInput.company, 160),
    email: text(contactInput.email, 200).toLowerCase(),
    phone: text(contactInput.phone, 40),
  };
  if (!contact.name) throw new CustomHatValidationError("Add a contact name.");
  if (contact.email && !looksLikeEmail(contact.email))
    throw new CustomHatValidationError("Check the email address.");
  if (!contact.email && !contact.phone)
    throw new CustomHatValidationError("Add an email address or phone number so we can reach you.");

  if (!Array.isArray(input.hats) || input.hats.length === 0)
    throw new CustomHatValidationError("Design at least one hat.");
  if (input.hats.length > CUSTOM_HAT_MAX_DESIGNS)
    throw new CustomHatValidationError(
      `You can submit up to ${CUSTOM_HAT_MAX_DESIGNS} designs at a time.`,
    );

  const hats = input.hats.map((rawHat, index): HatDesign => {
    const hat = record(rawHat);
    const label = `Hat ${index + 1}`;
    const colour = typeof hat.colour === "string" ? hat.colour : "";
    if (!feltColour(colour)) throw new CustomHatValidationError(`${label}: choose a felt colour.`);
    const quantity = Number(hat.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > CUSTOM_HAT_MAX_QUANTITY)
      throw new CustomHatValidationError(
        `${label}: quantity must be a whole number from 1 to ${CUSTOM_HAT_MAX_QUANTITY}.`,
      );
    const placement = (value: unknown, side: LogoSide): LogoPlacement => {
      const p = record(value);
      if (p.enabled !== true) return emptyPlacement();
      const fileKey = typeof p.fileKey === "string" && p.fileKey ? p.fileKey : null;
      if (fileKey && !ownsFile(fileKey))
        throw new CustomHatValidationError(`${label}: re-upload the ${side} logo.`);
      const notes = longText(p.notes, CUSTOM_HAT_NOTES_MAX);
      if (!fileKey && !notes)
        throw new CustomHatValidationError(`${label}: upload the ${side} logo, or describe it.`);
      const fileType =
        fileKey && typeof p.fileType === "string" && p.fileType in CUSTOM_HAT_FILE_TYPES
          ? p.fileType
          : null;
      return {
        enabled: true,
        fileKey,
        fileName: fileKey ? text(p.fileName, 160) || "logo" : null,
        fileType,
        notes,
      };
    };
    const tagInput = record(hat.tag);
    const tagText = text(tagInput.text, CUSTOM_HAT_TAG_MAX);
    if (tagInput.enabled === true && !tagText)
      throw new CustomHatValidationError(`${label}: type the text for the tag.`);
    return {
      id: text(hat.id, 40) || `hat-${index + 1}`,
      colour,
      quantity,
      front: placement(hat.front, "front"),
      back: placement(hat.back, "back"),
      tag:
        tagInput.enabled === true ? { enabled: true, text: tagText } : { enabled: false, text: "" },
      notes: longText(hat.notes, CUSTOM_HAT_NOTES_MAX),
    };
  });
  return { contact, notes: longText(input.notes, 2000), hats };
}

export function fileKeysOf(submission: CustomHatSubmission | null | undefined): string[] {
  if (!submission) return [];
  return submission.hats
    .flatMap((hat) => [hat.front.fileKey, hat.back.fileKey])
    .filter((key): key is string => !!key);
}

export const totalHats = (submission: CustomHatSubmission | null | undefined) =>
  submission ? submission.hats.reduce((sum, hat) => sum + hat.quantity, 0) : 0;
