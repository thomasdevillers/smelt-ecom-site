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

  it("converts multi-row tables to readable, unmashed text", () => {
    const tableOut = renderEmail({
      preheader: "Peek text",
      heading: "Your order",
      blocks: [
        "<table><tr><td>Forest Green</td><td>× 2</td></tr><tr><td>Natural Cream</td><td>× 1</td></tr></table>",
      ],
    });
    expect(tableOut.text).toContain("Forest Green");
    expect(tableOut.text).toContain("Natural Cream");
    expect(tableOut.text).not.toContain("2Natural");
    expect(tableOut.text.indexOf("Natural Cream")).toBeGreaterThan(
      tableOut.text.indexOf("Forest Green"),
    );
  });
});
