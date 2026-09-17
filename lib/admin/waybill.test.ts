import { describe, expect, it } from "vitest";
import { readWaybill } from "./waybill";

describe("readWaybill", () => {
  it("accepts a scanned waybill number", () => {
    expect(readWaybill("1234567890")).toBe("1234567890");
    expect(readWaybill("  1234567890\n")).toBe("1234567890");
  });
  it("strips prefixes and separators some labels encode", () => {
    expect(readWaybill("JNB-1234 567 890")).toBe("1234567890");
    expect(readWaybill("*123456*")).toBe("123456");
  });
  it("rejects codes that are not waybill numbers", () => {
    expect(readWaybill("12345")).toBeNull();
    expect(readWaybill("https://www.saunahat.co.za/product")).toBeNull();
    expect(readWaybill("")).toBeNull();
    expect(readWaybill("1".repeat(31))).toBeNull();
  });
});
