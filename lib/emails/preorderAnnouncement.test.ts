import { describe, expect, it } from "vitest";
import { preorderAnnouncementEmail } from "./preorderAnnouncement";
import { PREORDER_DATE_LABEL, PREORDER_PRICE, REGULAR_PRICE } from "../salesMode";

describe("preorderAnnouncementEmail", () => {
  it("announces pre-orders with the current price and dispatch promise", () => {
    const email = preorderAnnouncementEmail();
    expect(email.subject).toContain("pre-orders are open");
    for (const content of [email.html, email.text]) {
      expect(content).toContain(`R${PREORDER_PRICE}`);
      expect(content).toContain(`R${REGULAR_PRICE}`);
      expect(content).toContain(`Pre-orders ship on ${PREORDER_DATE_LABEL}.`);
      expect(content).toContain("not the delivery date");
      expect(content).toContain("reply to this email");
      expect(content).toContain("Tom &");
    }
  });

  it("uses the shared branded layout and a tracked product link", () => {
    const { html, text } = preorderAnnouncementEmail();
    expect(html).toContain("email-card");
    expect(html).toContain("hat-green-front-nobg.png");
    expect(html).toContain("prefers-color-scheme:dark");
    const link = text.match(/Pre-order your Smelt: (.+)/)?.[1];
    const url = new URL(link!);
    expect(url.pathname).toBe("/product");
    expect(url.searchParams.get("utm_campaign")).toBe("waitlist_preorder");
  });
});
