import { describe, it, expect } from "vitest";
import { orderItemsTable, moneyRow, addressBlock } from "./components";

describe("email components", () => {
  it("renders an items table with names and quantities", () => {
    const html = orderItemsTable([{ colour: "green", name: "Forest Green", qty: 2 }]);
    expect(html).toContain("Forest Green");
    expect(html).toContain("2");
  });

  it("handles no items", () => {
    expect(orderItemsTable([])).toContain("no line items");
  });

  it("renders a money row with label and value", () => {
    const html = moneyRow("Total", "R1 044");
    expect(html).toContain("Total");
    expect(html).toContain("R1 044");
  });

  it("renders an address block", () => {
    const html = addressBlock({
      line1: "1 Main Rd", city: "Cape Town", postalCode: "8001",
      province: "WC", country: "South Africa",
    });
    expect(html).toContain("1 Main Rd");
    expect(html).toContain("Cape Town");
  });
});
