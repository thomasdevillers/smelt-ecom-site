import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CartDrawer from "./CartDrawer";
import CartPage from "@/app/cart/page";
import { useCart } from "@/lib/cart";
import { useAvailability } from "@/lib/useAvailability";
import type { Availability } from "@/lib/availability";

vi.mock("@/lib/cart", () => ({ useCart: vi.fn() }));
vi.mock("@/lib/useAvailability", () => ({ useAvailability: vi.fn() }));

const stock: Availability = {
  green: 2, cream: 4, localTest: true,
};

function availability(value: Availability | null, error = "") {
  vi.mocked(useAvailability).mockReturnValue({ stock: value, error, refresh: vi.fn() });
}

describe.each([CartDrawer, CartPage])("%s stock limits", (Component) => {
  beforeEach(() => {
    vi.mocked(useCart).mockReturnValue({
      cart: { green: 2, cream: 1 }, count: 3, subtotal: 1550,
      dispatch: vi.fn(), isOpen: true, openCart: vi.fn(), closeCart: vi.fn(),
    });
    availability(stock);
  });

  function button(html: string, action: string, colour: string) {
    const name = colour === "green" ? "Forest Green" : "Natural Cream";
    const tag = html.match(new RegExp(`<button[^>]*aria-label="${action} ${name}"[^>]*>`))?.[0];
    expect(tag).toBeDefined();
    return tag!;
  }

  it("disables increases only for the colour at its limit and explains why", () => {
    const html = renderToStaticMarkup(createElement(Component));
    expect(button(html, "Increase", "green")).toContain("disabled");
    expect(button(html, "Increase", "cream")).not.toContain("disabled");
    expect(button(html, "Decrease", "green")).not.toContain("disabled");
    expect(html).toContain("Only 2 available");
  });

  it("enables increases after physical stock is replenished", () => {
    availability({ ...stock, green: 3 });
    const html = renderToStaticMarkup(createElement(Component));
    expect(button(html, "Increase", "green")).not.toContain("disabled");
  });

  it("blocks increases while checking stock but keeps decreases available", () => {
    availability(null);
    const html = renderToStaticMarkup(createElement(Component));
    expect(button(html, "Increase", "green")).toContain("disabled");
    expect(button(html, "Increase", "cream")).toContain("disabled");
    expect(button(html, "Decrease", "green")).not.toContain("disabled");
    expect(html).toContain("Checking stock…");
  });

  it("offers a retry when stock cannot be checked", () => {
    availability(null, "We couldn’t check availability. Please try again.");
    const html = renderToStaticMarkup(createElement(Component));
    expect(button(html, "Increase", "green")).toContain("disabled");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
  });
});
