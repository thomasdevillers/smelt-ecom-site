import { describe, it, expect } from "vitest";
import { COLORS, FONT_STACK, absoluteUrl } from "./theme";

describe("email theme", () => {
  it("exposes brand colors", () => {
    expect(COLORS.paper).toBe("#F6F1E3");
    expect(COLORS.ink).toBe("#0E3B2A");
    expect(COLORS.terracotta).toBe("#E4633C");
  });

  it("builds absolute urls from SITE_URL", () => {
    expect(absoluteUrl("/images/x.png", "https://saunahat.co.za")).toBe(
      "https://saunahat.co.za/images/x.png",
    );
  });

  it("strips a trailing slash on the base", () => {
    expect(absoluteUrl("/a", "https://x.co/")).toBe("https://x.co/a");
  });
});
