import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./purchaseStore", () => ({ getAvailability: vi.fn() }));
import { getAvailability } from "./purchaseStore";
import { getProductAvailability } from "./productAvailability";

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("product page inventory", () => {
  it("reads the same live availability as checkout without a separate stock cache", async () => {
    const stock = { green: 2, cream: 0, preorder: { green: 0, cream: 5 }, batch: "2026-11-30", timing: "Pre-order", localTest: false };
    vi.mocked(getAvailability).mockResolvedValue(stock);
    expect(await getProductAvailability()).toBe(stock);
    expect(getAvailability).toHaveBeenCalledOnce();
  });
  it("returns unknown stock without exposing storage details on failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getAvailability).mockRejectedValue(new Error("private credentials"));
    expect(await getProductAvailability()).toBeNull();
    expect(log).toHaveBeenCalledExactlyOnceWith("Product availability is temporarily unavailable.");
  });
});
