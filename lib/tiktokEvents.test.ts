import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
import { buildTikTokPayload, buildTikTokPurchaseEvents, sendTikTokEvents, tiktokUser } from "./tiktokEvents";

const input = {
  reference: "verified-order-123", email: " Buyer@Example.com ", phone: "082 123 4567",
  amount: 540, currency: "ZAR", cart: { green: 1, cream: 0 }, paidAt: "2026-09-07T12:00:00Z",
  client: { ttclid: "click-123", ttp: "browser-123", user_agent: "customer-browser" },
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("TikTok Events API", () => {
  it("builds the v1.3 envelope and payment events with stable IDs and hashed matching", () => {
    const events = buildTikTokPurchaseEvents(input);
    expect(events.map((e) => e.event)).toEqual(["AddPaymentInfo", "PlaceAnOrder", "Purchase"]);
    for (const event of events) {
      expect(event.event_id).toBe(input.reference);
      expect(event.event_time).toBe(Date.parse(input.paidAt) / 1000);
      expect(event.user).toEqual({
        email: createHash("sha256").update("buyer@example.com").digest("hex"),
        phone: createHash("sha256").update("+27821234567").digest("hex"),
        ...input.client,
      });
      expect(event.user.ip).toBeUndefined();
      expect(event.properties.value).toBe(540);
      expect(event.properties.contents).toEqual([{ content_id: "smelt-sauna-hat-green", content_type: "product", content_name: "Smelt Sauna Hat - Forest Green", quantity: 1, price: 450 }]);
    }
    vi.stubEnv("TIKTOK_TEST_EVENT_CODE", "TEST123");
    expect(buildTikTokPayload(events)).toEqual({ event_source: "web", event_source_id: "DAFEQ6BC77UES974NGD0", data: events, test_event_code: "TEST123" });
  });

  it("omits raw PII and uses browser request IP and user agent", () => {
    expect(tiktokUser({ email: "raw@example.com", phone: "+27821234567", external_id: "raw-id", ip: "forged" }, new Request("https://saunahat.co.za", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1", "user-agent": "browser" } }))).toEqual({ ip: "203.0.113.10", user_agent: "browser" });
  });

  it("sends the token only in the server header and handles TikTok application errors", async () => {
    vi.stubEnv("TIKTOK_EVENTS_API_TOKEN", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendTikTokEvents(buildTikTokPurchaseEvents(input))).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect(options.headers["Access-Token"]).toBe("test-secret");
    expect(options.body).not.toContain("test-secret");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 40001 })));
    expect(await sendTikTokEvents(buildTikTokPurchaseEvents(input))).toBe(false);
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await sendTikTokEvents(buildTikTokPurchaseEvents(input))).toBe(false);
  });

  it("does not send without configuration", async () => {
    vi.stubEnv("TIKTOK_EVENTS_API_TOKEN", "");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await sendTikTokEvents(buildTikTokPurchaseEvents(input))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
