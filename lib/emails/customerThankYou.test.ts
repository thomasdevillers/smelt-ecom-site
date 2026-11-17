import { describe, expect, it } from "vitest";
import { customerThankYouEmail } from "./customerThankYou";

describe("past-customer thank-you email", () => {
  it("uses a first name, exact subject, and working text and HTML links", () => {
    const email = customerThankYouEmail("Tom Example");
    expect(email.subject).toBe("We'd rather give you R100 than Instagram.");
    expect(email.text).toContain("Hey Tom!");
    expect(email.text).toContain("Use code SMELT100 at checkout.");
    expect(email.text).toContain("Tom & Marc here from Smelt Sauna Hats!");
    expect(email.text).not.toContain("72 hours");
    expect(email.text).toMatch(/Here's a link to the site for your convenience: https:\/\/.+\/product\?/);
    expect(email.html).toContain('<a href="https://');
    expect(email.html).toContain("utm_campaign=customer_thank_you");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<strong");
    expect(email.text).not.toContain("**");
  });

  it("escapes names and handles missing names", () => {
    expect(customerThankYouEmail("<Tom>").html).toContain("Hey &lt;Tom&gt;!");
    expect(customerThankYouEmail(" ").text).toContain("Hey there!");
  });
});
