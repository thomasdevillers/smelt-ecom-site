import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone, reviewWhatsAppUrl } from "./whatsapp";

describe("review WhatsApp links", () => {
  it("normalizes common South African phone formats for wa.me", () => {
    expect(normalizeWhatsAppPhone("083 787 5826")).toBe("27837875826");
    expect(normalizeWhatsAppPhone("+27 83 787 5826")).toBe("27837875826");
    expect(normalizeWhatsAppPhone("0027 83 787 5826")).toBe("27837875826");
  });

  it("prefills the customer's name and exact review link", () => {
    const reviewUrl = "https://saunahat.co.za/review/private-token";
    const result = reviewWhatsAppUrl({ phone: "0837875826", customerName: "Tumi Customer", reviewUrl });
    const url = new URL(result!);
    expect(url.origin + url.pathname).toBe("https://wa.me/27837875826");
    expect(url.searchParams.get("text")).toContain("Hi Tumi");
    expect(url.searchParams.get("text")).toContain(reviewUrl);
  });

  it("does not create a link for a missing or invalid phone number", () => {
    expect(reviewWhatsAppUrl({ phone: "", customerName: "Tumi", reviewUrl: "https://example.com/review" })).toBeNull();
  });
});
