import { describe, it, expect } from "vitest";
import { renderEmail } from "./layout";

describe("renderEmail", () => {
  const out = renderEmail({
    preheader: "Peek text",
    heading: "Your order is confirmed",
    intro: "Thanks for ordering.",
    blocks: ["<p>Body block</p>"],
    cta: { label: "View", url: "https://saunahat.co.za/x" },
  });

  it("returns html and text", () => {
    expect(out.html).toContain("<html");
    expect(typeof out.text).toBe("string");
  });

  it("includes heading, preheader and cta in html", () => {
    expect(out.html).toContain("Your order is confirmed");
    expect(out.html).toContain("Peek text");
    expect(out.html).toContain("https://saunahat.co.za/x");
  });

  it("uses inline fallbacks plus a dark-mode style block", () => {
    expect(out.html).toContain("</style>");
    expect(out.html).toContain("style=");
    expect(out.html).toContain('name="color-scheme" content="light dark"');
    expect(out.html).toContain("@media (prefers-color-scheme:dark)");
    expect(out.html).toContain("[data-ogsc] .email-body");
  });

  it("text version is plain and includes heading + cta url", () => {
    expect(out.text).toContain("Your order is confirmed");
    expect(out.text).toContain("https://saunahat.co.za/x");
    expect(out.text).not.toContain("<");
  });

  it("keeps font declarations inside intact HTML style attributes", () => {
    const styles = [...out.html.matchAll(/style="([^"]*)"/g)].map((match) => match[1]);
    const headingStyle = styles.find((style) => style.includes("font-weight:800"));
    expect(headingStyle).toContain("font-family:'Space Grotesk'");
    expect(headingStyle).toContain("color:#0E3B2A");
    const buttonStyle = styles.find((style) => style.includes("display:inline-block"));
    expect(buttonStyle).toContain("background-color:#0E3B2A");
    expect(buttonStyle).toContain("color:#F6F1E3");
    expect(buttonStyle).toContain("text-decoration:none");
  });

  it("uses the site palette in light mode and a deliberate forest dark theme", () => {
    expect(out.html).toContain('class="email-body"');
    expect(out.html).toContain('class="email-card email-text"');
    expect(out.html).toContain("background-color:#F6F1E3");
    expect(out.html).toContain("background-color:#123D2E!important");
    expect(out.html).toContain("background-color:#F6F1E3!important;color:#0E3B2A!important");
    expect(out.html).toContain('class="email-logo-tile"');
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
