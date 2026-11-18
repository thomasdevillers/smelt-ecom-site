import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FELT_COLOURS, feltTile } from "./palette";
import { validateSubmission, newHatDesign, totalHats, fileKeysOf } from "./shared";
import { r2Settings } from "./storage";
import { customHatWhatsAppUrl } from "../whatsapp";

const contact = { name: "Jane", company: "Hot Rocks", email: "jane@example.com", phone: "" };
const hat = (patch: Record<string, unknown> = {}) => ({ ...newHatDesign("a", "L-402"), ...patch });
const owns = (key: string) => key === "custom-hats/test/req/logo.png";

describe("felt palette", () => {
  it("has unique codes and a texture tile for every colour", () => {
    expect(new Set(FELT_COLOURS.map(c => c.code)).size).toBe(FELT_COLOURS.length);
    for (const colour of FELT_COLOURS) {
      expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(existsSync(join(process.cwd(), "public", feltTile(colour.code)))).toBe(true);
    }
  });
});

describe("validateSubmission", () => {
  it("accepts a full design and cleans text", () => {
    const result = validateSubmission({
      contact: { ...contact, email: " JANE@Example.com " },
      notes: "  Need by March  ",
      hats: [hat({
        quantity: 25,
        front: { enabled: true, fileKey: "custom-hats/test/req/logo.png", fileName: "logo.png", fileType: "image/png", notes: "white thread" },
        tag: { enabled: true, text: "  Est.   2024 " },
      })],
    }, owns);
    expect(result.contact.email).toBe("jane@example.com");
    expect(result.notes).toBe("Need by March");
    expect(result.hats[0].tag.text).toBe("Est. 2024");
    expect(result.hats[0].front.fileKey).toBe("custom-hats/test/req/logo.png");
    expect(result.hats[0].back.enabled).toBe(false);
    expect(totalHats(result)).toBe(25);
    expect(fileKeysOf(result)).toEqual(["custom-hats/test/req/logo.png"]);
  });

  it("rejects artwork keys that were not issued to this request", () => {
    expect(() => validateSubmission({ contact, hats: [hat({ back: { enabled: true, fileKey: "custom-hats/test/other/x.png" } })] }, owns))
      .toThrow("Hat 1: re-upload the back logo.");
  });

  it("requires a colour, a sensible quantity, tag text and a way to reach the customer", () => {
    expect(() => validateSubmission({ contact, hats: [hat({ colour: "PINK" })] }, owns)).toThrow("choose a felt colour");
    expect(() => validateSubmission({ contact, hats: [hat({ quantity: 0 })] }, owns)).toThrow("quantity");
    expect(() => validateSubmission({ contact, hats: [hat({ tag: { enabled: true, text: " " } })] }, owns)).toThrow("tag");
    expect(() => validateSubmission({ contact: { ...contact, email: "", phone: "" }, hats: [hat()] }, owns)).toThrow("email address or phone");
    expect(() => validateSubmission({ contact, hats: [] }, owns)).toThrow("at least one hat");
  });

  it("allows a logo described in notes when there is no file yet", () => {
    const result = validateSubmission({ contact, hats: [hat({ front: { enabled: true, fileKey: null, notes: "Our wave logo, file to follow" } })] }, owns);
    expect(result.hats[0].front).toMatchObject({ enabled: true, fileKey: null, notes: "Our wave logo, file to follow" });
    expect(() => validateSubmission({ contact, hats: [hat({ front: { enabled: true } })] }, owns)).toThrow("upload the front logo, or describe it");
  });
});

describe("r2Settings", () => {
  it("accepts a bucket name or the S3 API URL from the dashboard", () => {
    expect(r2Settings({ R2_ACCOUNT_ID: "abc123", R2_BUCKET: "smelt-custom-hats" })).toMatchObject({ host: "abc123.r2.cloudflarestorage.com", bucket: "smelt-custom-hats" });
    expect(r2Settings({ R2_BUCKET: "https://abc123.eu.r2.cloudflarestorage.com/smelt-custom-hats" })).toMatchObject({ host: "abc123.eu.r2.cloudflarestorage.com", bucket: "smelt-custom-hats" });
  });
});

describe("customHatWhatsAppUrl", () => {
  it("builds a wa.me link with the design URL", () => {
    const url = customHatWhatsAppUrl({ phone: "082 123 4567", customerName: "Jane Doe", designUrl: "https://saunahat.co.za/custom/abc" });
    expect(url).toMatch(/^https:\/\/wa\.me\/27821234567\?/);
    expect(decodeURIComponent(url!.split("text=")[1].replace(/\+/g, " "))).toContain("https://saunahat.co.za/custom/abc");
  });
});
