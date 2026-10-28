import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import ReviewAccessForm from "./ReviewAccessForm";

describe("review email entry", () => {
  it("uses native email validation without the pattern that rejected valid customer addresses", () => {
    const html = renderToStaticMarkup(createElement(ReviewAccessForm));
    const input = html.match(/<input\b[^>]*>/)?.[0];
    expect(input).toContain('type="email"');
    expect(input).toContain('autoComplete="email"');
    expect(input).not.toContain("pattern=");
  });
});
