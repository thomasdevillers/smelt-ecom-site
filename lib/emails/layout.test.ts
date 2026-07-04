import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";

describe("renderEmail", () => {
  const out = renderEmail({
    preheader: "Peek text",
    heading: "Your pre-order is confirmed",
    intro: "Thanks for pre-ordering.",
    blocks: ["<p>Body block</p>"],
    cta: { label: "View", url: "https://saunahat.co.za/x" },
  });

  it("returns html and text", () => {
    expect(out.html).toContain("<html");
    expect(typeof out.text).toBe("string");
  });

  it("includes heading, preheader and cta in html", () => {
    expect(out.html).toContain("Your pre-order is confirmed");
    expect(out.html).toContain("Peek text");
    expect(out.html).toContain("https://saunahat.co.za/x");
  });

  it("uses inline styles, not a style block", () => {
    expect(out.html).not.toContain("</style>");
    expect(out.html).toContain("style=");
  });

  it("text version is plain and includes heading + cta url", () => {
    expect(out.text).toContain("Your pre-order is confirmed");
    expect(out.text).toContain("https://saunahat.co.za/x");
    expect(out.text).not.toContain("<");
  });

  it("signs off warmly by default", () => {
    expect(out.text).toContain("Warm regards");
    expect(out.text).toContain("Tom & Marc");
  });
});
