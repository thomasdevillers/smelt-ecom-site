import { describe, expect, it } from "vitest";
import { earlyShippingEmail } from "./earlyShipping";
import { EMAIL_QUESTION, emailEntryAnswer } from "../research/emailEntry";

describe("earlyShippingEmail", () => {
  it("does not use em dashes in the subject or copy", () => {
    const email = earlyShippingEmail();
    for (const content of [email.subject, email.html, email.text]) {
      expect(content).not.toContain("—");
    }
  });

  it("announces the earlier dispatch without promising an arrival date", () => {
    const email = earlyShippingEmail();
    for (const content of [email.html, email.text]) {
      expect(content).toContain("30 November");
      expect(content).toContain("tomorrow, 24 November");
      expect(content).not.toContain("arrive tomorrow");
      expect(content).toContain("Completely optional");
      expect(content).toContain("Your order is already being taken care of");
      expect(content).toContain("Tom &");
    }
  });

  it("reuses the order-email branding and links to the questionnaire", () => {
    const { html, text } = earlyShippingEmail();
    expect(html).toContain("email-card");
    expect(html).toContain("hat-green-front-nobg.png");
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain(EMAIL_QUESTION.title);
    for (const option of EMAIL_QUESTION.options!) {
      const line = text.split("\n").find((line) => line.startsWith(`${option}: `));
      expect(line).toBeDefined();
      const url = new URL(line!.slice(option.length + 2));
      expect(url.pathname).toBe("/help-shape-smelt");
      expect(url.searchParams.get("utm_campaign")).toBe("early_shipping_november_2026");
      expect(url.searchParams.has("email")).toBe(false);
      expect(emailEntryAnswer(url.searchParams)).toBe(option);
      expect(html).toContain(url.toString().replaceAll("&", "&amp;"));
    }
  });
});
