import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { normalizeTikTokPhone, TIKTOK_PIXEL_ID, tiktokCartParameters, type TikTokClientContext } from "./tiktok";
import type { CartState } from "./cartReducer";
import { SITE_URL } from "./seo";

export interface TikTokServerEvent {
  event: string;
  event_id: string;
  event_time: number;
  page: { url: string };
  user: Record<string, string>;
  properties: Record<string, unknown>;
}
const clean = (value: unknown, max = 1000): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

export function tiktokUser(input: unknown, request?: Request): Record<string, string> {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const user: Record<string, string> = {};
  for (const key of ["email", "phone", "external_id"]) {
    if (typeof raw[key] === "string" && /^[a-f0-9]{64}$/i.test(raw[key])) user[key] = raw[key].toLowerCase();
  }
  for (const key of ["ttclid", "ttp", "user_agent"]) {
    const value = clean(raw[key]);
    if (value) user[key] = value;
  }
  // Only browser requests supply client network details; never use webhook server headers.
  const ip = request?.headers.get("x-forwarded-for")?.split(",")[0].trim() || request?.headers.get("x-real-ip");
  if (ip && isIP(ip)) user.ip = ip;
  const agent = clean(request?.headers.get("user-agent"));
  if (agent) user.user_agent = agent;
  return user;
}

export function buildTikTokPayload(events: TikTokServerEvent[]) {
  return {
    event_source: "web", event_source_id: TIKTOK_PIXEL_ID, data: events,
    ...(process.env.TIKTOK_TEST_EVENT_CODE ? { test_event_code: process.env.TIKTOK_TEST_EVENT_CODE } : {}),
  };
}

/** Bounded best-effort delivery. Never log credentials, customer data, or API response bodies. */
export async function sendTikTokEvents(events: TikTokServerEvent[]): Promise<boolean> {
  const token = process.env.TIKTOK_EVENTS_API_TOKEN;
  if (!token || !events.length) return false;
  try {
    const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(buildTikTokPayload(events)),
      signal: AbortSignal.timeout(4000),
    });
    const result = await response.json() as { code?: number };
    if (!response.ok || result.code !== 0) {
      console.error("TikTok Events API rejected request", { status: response.status, code: result.code });
      return false;
    }
    return true;
  } catch {
    console.error("TikTok Events API request failed");
    return false;
  }
}

export interface TikTokPurchaseInput {
  reference: string; email: string; phone?: unknown; amount: number; currency: string;
  cart: CartState; paidAt?: string | null; client?: TikTokClientContext; request?: Request;
}
export function buildTikTokPurchaseEvents(input: TikTokPurchaseInput): TikTokServerEvent[] {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const phone = typeof input.phone === "string" ? normalizeTikTokPhone(input.phone) : undefined;
  const user = tiktokUser({
    ...input.client,
    email: input.email.trim() ? hash(input.email.trim().toLowerCase()) : undefined,
    phone: phone ? hash(phone) : undefined,
  }, input.request);
  const paidAt = input.paidAt ? Date.parse(input.paidAt) : NaN;
  return ["AddPaymentInfo", "PlaceAnOrder", "Purchase"].map((event) => ({
    event, event_id: input.reference,
    event_time: Math.floor((Number.isFinite(paidAt) ? paidAt : Date.now()) / 1000),
    page: { url: `${SITE_URL}/checkout/success` }, user,
    properties: { ...tiktokCartParameters(input.cart, input.amount), currency: input.currency },
  }));
}
export async function sendTikTokPurchase(input: TikTokPurchaseInput): Promise<void> {
  if (!input.reference || input.amount <= 0) return;
  await sendTikTokEvents(buildTikTokPurchaseEvents(input));
}
