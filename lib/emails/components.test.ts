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
      line1: "1 Main Rd", company: "Oak & Pine Estate", city: "Cape Town", postalCode: "8001",
      province: "WC", country: "South Africa",
    });
    expect(html).toContain("1 Main Rd");
    expect(html).toContain("Oak &amp; Pine Estate");
    expect(html).toContain("Cape Town");
  });

  it("doesn't repeat suburb/city/province/country when line1 is already the full formatted address", () => {
    const html = addressBlock({
      line1: "285 Beach Road, Sea Point, Cape Town, 8005, South Africa",
      formattedAddress: "285 Beach Road, Sea Point, Cape Town, 8005, South Africa",
      suburb: "Sea Point", city: "Cape Town", postalCode: "8005",
      province: "Western Cape", country: "South Africa", phone: "0821234567",
    });
    expect(html.match(/Cape Town/g)?.length).toBe(1);
    expect(html).toContain("0821234567");
  });
});
