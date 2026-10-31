import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), hgetall: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { hgetall = mocks.hgetall; } }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.requireAdmin }));

import { GET } from "@/app/api/admin/orders/export/route";
import { exportOrdersCsv } from "./orderExport";
import { completionKey } from "./orders";

const transaction = {
  reference: "order-1", status: "success", amount: 54001, currency: "ZAR", fees: 1234, channel: "card",
  paid_at: "2026-10-30T22:30:00.000Z", customer: { email: "customer@example.com" },
  metadata: { customerName: 'Zoë, "Test"\nCustomer', items: [{ colour: "cream", name: "Cream sauna hat", qty: 1 }] },
};
function page(data: unknown[], total = data.length, pageCount = 1) {
  return { ok: true, status: 200, json: async () => ({ status: true, data, meta: { total, pageCount } }) };
}

// Read quoted CSV fields independently, including escaped quotes and embedded line breaks.
function readCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && char === "\r" && text[i + 1] === "\n") {
      rows.push([...row, cell]); row = []; cell = ""; i++;
    } else cell += char;
  }
  const [headers, ...data] = rows;
  return data.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue(page([transaction]));
  mocks.hgetall.mockResolvedValue({});
});

describe("accounting order export", () => {
  it("preserves recorded cents and historical items, quotes Unicode names, and uses South African dates", async () => {
    const csv = await exportOrdersCsv();
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(readCsv(csv)).toEqual([{
      "Order reference": "order-1", "Paid date (SAST)": "2026-10-31", "Paid time (SAST)": "00:30:00",
      "Customer name": transaction.metadata.customerName, "Customer email": "customer@example.com",
      "Items": "Cream sauna hat (cream) x 1", "Hat quantity": "1", "Currency": "ZAR", "Amount paid": "540.01",
      "Paystack fees": "12.34", "Payment channel": "card", "Fulfilment status": "Active", "Completed at (SAST)": "", "Payment mode": "test",
    }]);
    expect(csv).not.toContain("sk_test_example");
  });

  it("exports all provider pages with active and completed orders once each", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ ...transaction, reference: `order-${index}` }));
    mocks.fetch.mockResolvedValueOnce(page(first, 101, 2)).mockResolvedValueOnce(page([first[99], { ...transaction, reference: "order-100" }], 101, 2));
    mocks.hgetall.mockResolvedValue({ "order-100": "2026-10-31T10:00:00.000Z" });
    const rows = readCsv(await exportOrdersCsv());
    expect(rows).toHaveLength(101);
    expect(new Set(rows.map(row => row["Order reference"])).size).toBe(101);
    expect(rows.filter(row => row["Fulfilment status"] === "Active")).toHaveLength(100);
    expect(rows.find(row => row["Order reference"] === "order-100")).toMatchObject({ "Fulfilment status": "Completed", "Completed at (SAST)": "2026-10-31 12:00:00" });
    expect(mocks.fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("page"))).toEqual(["1", "2"]);
    for (const [url] of mocks.fetch.mock.calls) expect(new URL(url).searchParams.get("status")).toBe("success");
    expect(mocks.hgetall).toHaveBeenCalledWith(completionKey());
  });

  it("leaves unavailable fees, dates and quantities blank while preserving an explicit zero fee", async () => {
    mocks.fetch.mockResolvedValue(page([
      { ...transaction, metadata: {}, fees: null, paid_at: null },
      { ...transaction, reference: "zero-fee", fees: 0, metadata: JSON.stringify(transaction.metadata) },
    ]));
    const rows = readCsv(await exportOrdersCsv());
    expect(rows[0]).toMatchObject({ "Paystack fees": "", "Paid date (SAST)": "", "Hat quantity": "" });
    expect(rows[1]).toMatchObject({ "Paystack fees": "0.00", "Hat quantity": "1" });
  });

  it.each(["=HYPERLINK(\"https://example.com\")", "+123", "-123", "@SUM(A1)", "  =1+1", "\t=1+1", "\n=1+1"])("neutralizes spreadsheet formulas in customer text: %j", async name => {
    mocks.fetch.mockResolvedValue(page([{ ...transaction, metadata: { ...transaction.metadata, customerName: name } }]));
    const [row] = readCsv(await exportOrdersCsv());
    // normalizeOrder trims surrounding whitespace before the CSV is serialized.
    expect(row["Customer name"]).toBe(`'${name.trim()}`);
  });

  it("returns a private downloadable CSV only after admin authentication", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
    const response = await GET();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="smelt-orders-live-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(readCsv(await response.text())[0]["Payment mode"]).toBe("live");
  });

  it("returns an error instead of downloading a partial export if a later page fails", async () => {
    mocks.fetch.mockResolvedValueOnce(page([transaction], 2, 2)).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ status: false }) });
    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.has("Content-Disposition")).toBe(false);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Could not load orders from Paystack") });
  });

  it.each([{ amount: undefined }, { amount: 123.4 }, { status: "failed" }, { currency: "" }])("rejects invalid payment data instead of making up accounting amounts: %j", async change => {
    mocks.fetch.mockResolvedValue(page([{ ...transaction, ...change }]));
    await expect(exportOrdersCsv()).rejects.toThrow("invalid payment details");
  });

  it("downloads a header-only CSV when there are no paid orders", async () => {
    mocks.fetch.mockResolvedValue(page([], 0, 0));
    const response = await GET();
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('"Amount paid"');
    expect(readCsv(csv)).toEqual([]);
  });
});
