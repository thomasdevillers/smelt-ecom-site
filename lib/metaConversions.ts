import "server-only";

import { createHash } from "node:crypto";
import { META_PIXEL_ID, metaContentId, type MetaClientContext } from "./meta";
import type { OrderItem } from "./orderTypes";
import { SITE_URL } from "./seo";

const DEFAULT_GRAPH_API_VERSION = "v23.0";

export interface MetaPurchaseInput {
  reference: string;
  email: string;
  amount: number;
  currency: string;
  items: OrderItem[];
  paidAt?: string | null;
  request?: Request;
  client?: MetaClientContext | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value: unknown, maxLength = 1000): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim().slice(0, maxLength);
  return result || undefined;
}

function requestIp(request?: Request): string | undefined {
  if (!request) return undefined;
  return clean(
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
      request.headers.get("x-real-ip"),
    100,
  );
}

export function buildMetaPurchaseEvent(input: MetaPurchaseInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const parsedPaidAt = input.paidAt ? Date.parse(input.paidAt) : Number.NaN;
  const eventTime = Number.isNaN(parsedPaidAt)
    ? Math.floor(Date.now() / 1000)
    : Math.floor(parsedPaidAt / 1000);
  const userData: Record<string, unknown> = {};
  const userAgent =
    clean(input.request?.headers.get("user-agent")) ??
    clean(input.client?.clientUserAgent);
  const ip = requestIp(input.request);
  const fbp = clean(input.client?.fbp, 200);
  const fbc = clean(input.client?.fbc, 200);

  if (normalizedEmail) userData.em = [sha256(normalizedEmail)];
  if (userAgent) userData.client_user_agent = userAgent;
  if (ip) userData.client_ip_address = ip;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return {
    event_name: "Purchase",
    event_time: eventTime,
    event_id: input.reference,
    action_source: "website",
    event_source_url: `${SITE_URL}/checkout/success?reference=${encodeURIComponent(input.reference)}`,
    user_data: userData,
    custom_data: {
      currency: input.currency.toUpperCase(),
      value: input.amount,
      content_type: "product",
      content_ids: input.items.map((item) => metaContentId(item.colour)),
      contents: input.items.map((item) => ({
        id: metaContentId(item.colour),
        quantity: item.qty,
      })),
      num_items: input.items.reduce((total, item) => total + item.qty, 0),
    },
  };
}

/** Best-effort server-side Purchase reporting; order completion never depends on Meta. */
export async function sendMetaPurchase(input: MetaPurchaseInput): Promise<void> {
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  if (!accessToken || !input.reference) return;

  const version = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
  const body: Record<string, unknown> = {
    data: [buildMetaPurchaseEvent(input)],
  };
  const testEventCode = clean(process.env.META_TEST_EVENT_CODE, 100);
  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      console.error(`Meta Conversions API error (${response.status}): ${details}`);
    }
  } catch (error) {
    console.error("Meta Conversions API request failed:", error);
  }
}
