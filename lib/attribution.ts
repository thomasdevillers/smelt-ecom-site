export const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const ATTRIBUTION_STORAGE_KEY = "smelt:attribution:v1";

export interface AttributionTouch {
  source: string;
  medium: string;
  capturedAt: string;
  landingPath: string;
  referrerHost?: string;
  campaign?: string;
  campaignId?: string;
  content?: string;
  term?: string;
}
export interface OrderAttribution {
  version: 1;
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
}
export type AttributionChannel = "meta" | "organic" | "unrecorded";
export const CHANNEL_LABELS: Record<AttributionChannel, string> = {
  meta: "Meta", organic: "Organic", unrecorded: "Not recorded",
};

const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 160) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
const token = (value: unknown) => text(value, 100).toLowerCase().replace(/[^a-z0-9._-]/g, "");
function sourceName(value: unknown) {
  const source = token(value);
  return ({ fb: "facebook", ig: "instagram", an: "meta_audience_network", msg: "messenger" } as Record<string, string>)[source] || source;
}
function host(value: unknown) {
  const candidate = text(value, 253).toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(candidate) ? candidate : "";
}
const belongsTo = (value: string, domain: string) => value === domain || value.endsWith(`.${domain}`);
const paymentHost = (value: string) => belongsTo(value, "paystack.com") || belongsTo(value, "paystack.co");

/** Keep only public route names; private tokens, query strings and fragments are never stored. */
export function attributionLandingPath(value: unknown): string {
  const path = typeof value === "string" ? value.split(/[?#]/, 1)[0] : "";
  if (["/", "/product", "/cart", "/checkout", "/checkout/success", "/checkout/recover", "/checkout/offer", "/articles", "/care", "/contact", "/policies", "/review"].includes(path)) return path;
  if (path.startsWith("/articles/")) return "/articles";
  if (path.startsWith("/checkout/recover/")) return "/checkout/recover";
  if (path.startsWith("/checkout/offer/")) return "/checkout/offer";
  if (path.startsWith("/review/")) return "/review";
  return "/";
}

function parseTouch(value: unknown): AttributionTouch | null {
  const data = obj(value), source = sourceName(data.source), medium = token(data.medium);
  const time = typeof data.capturedAt === "string" ? Date.parse(data.capturedAt) : NaN;
  if (!source || !medium || !Number.isFinite(time) || paymentHost(source)) return null;
  const touch: AttributionTouch = { source, medium, capturedAt: new Date(time).toISOString(), landingPath: attributionLandingPath(data.landingPath) };
  const referrerHost = host(data.referrerHost);
  if (referrerHost && !paymentHost(referrerHost)) touch.referrerHost = referrerHost;
  for (const key of ["campaign", "campaignId", "content", "term"] as const) {
    const value = text(data[key]);
    if (value) touch[key] = value;
  }
  return touch;
}

/** Historical order metadata remains readable after the browser's 30-day window expires. */
export function parseAttribution(value: unknown): OrderAttribution | null {
  const data = obj(value);
  if (data.version !== 1) return null;
  const firstTouch = parseTouch(data.firstTouch), lastTouch = parseTouch(data.lastTouch);
  if (!firstTouch || !lastTouch || firstTouch.capturedAt > lastTouch.capturedAt) return null;
  return { version: 1, firstTouch, lastTouch };
}

export function activeAttribution(value: unknown, now = Date.now()): OrderAttribution | null {
  const attribution = parseAttribution(value);
  if (!attribution) return null;
  const active = (touch: AttributionTouch) => {
    const age = now - Date.parse(touch.capturedAt);
    return age >= -60_000 && age < ATTRIBUTION_WINDOW_MS;
  };
  if (!active(attribution.lastTouch)) return null;
  return { ...attribution, firstTouch: active(attribution.firstTouch) ? attribution.firstTouch : attribution.lastTouch };
}

const metaSources = new Set(["facebook", "instagram", "messenger", "meta_audience_network"]);
export function attributionChannel(touch?: AttributionTouch | null): AttributionChannel {
  if (!touch) return "unrecorded";
  // A single Meta ad tag is enough. Also recognize previously tagged Meta ads.
  if (touch.source === "meta") return "meta";
  const medium = touch.medium.replace(/-/g, "_");
  if (metaSources.has(touch.source) && ["paid_social", "paidsocial", "cpc", "ppc", "paid", "cpm", "display"].includes(medium)) return "meta";
  // The store uses Organic as its simple bucket for everything without a Meta ad tag.
  return "organic";
}
export function attributionLabel(touch?: AttributionTouch | null) {
  return CHANNEL_LABELS[attributionChannel(touch)];
}

/** Explicit campaign tags take priority. A Facebook click ID alone never proves a paid ad. */
export function captureTouch(url: URL, referrer: string, now = Date.now()): AttributionTouch | null {
  if (/^\/(admin|api)(\/|$)/.test(url.pathname) || url.pathname.startsWith("/email/unsubscribe/") || url.pathname === "/checkout/success") return null;
  const params = url.searchParams;
  let referrerHost = "";
  try {
    const referrerUrl = new URL(referrer);
    if (["https:", "http:"].includes(referrerUrl.protocol)) referrerHost = host(referrerUrl.hostname);
  } catch { /* Missing/stripped referrers are normal. */ }
  if (referrerHost === host(url.hostname) || belongsTo(referrerHost, "saunahat.co.za") || paymentHost(referrerHost)) referrerHost = "";
  let source = sourceName(params.get("utm_source")), medium = token(params.get("utm_medium")) || "campaign";
  if (!source && params.has("gclid")) { source = "google"; medium = "cpc"; }
  if (!source && params.has("msclkid")) { source = "bing"; medium = "cpc"; }
  if (!source && referrerHost) {
    source = referrerHost; medium = "referral";
    if (/^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/.test(referrerHost)) { source = "google"; medium = "organic"; }
    for (const domain of ["google.com", "google.co.za", "bing.com", "duckduckgo.com", "search.yahoo.com"]) {
      if (belongsTo(referrerHost, domain)) { source = domain.split(".")[0] === "search" ? "yahoo" : domain.split(".")[0]; medium = "organic"; break; }
    }
    for (const [domain, platform] of [["facebook.com", "facebook"], ["instagram.com", "instagram"], ["tiktok.com", "tiktok"], ["t.co", "twitter"], ["linkedin.com", "linkedin"], ["pinterest.com", "pinterest"]]) {
      if (belongsTo(referrerHost, domain)) { source = platform; medium = "social_untagged"; break; }
    }
  }
  if (!source && params.has("fbclid")) { source = "facebook"; medium = "social_untagged"; }
  if (!source) { source = "direct"; medium = "none"; }
  return parseTouch({ source, medium, capturedAt: new Date(now).toISOString(), landingPath: url.pathname, referrerHost,
    campaign: params.get("utm_campaign"), campaignId: params.get("utm_id"), content: params.get("utm_content"), term: params.get("utm_term") });
}

export function mergeAttribution(previous: unknown, touch: AttributionTouch | null, now = Date.now()): OrderAttribution | null {
  const existing = activeAttribution(previous, now);
  if (!touch) return existing;
  const normalized = parseTouch(touch);
  if (!normalized) return existing;
  // Preserve a recent Meta ad visit through later direct, search or email visits.
  // Do not refresh its timestamp: the ad attribution still expires after 30 days.
  const retainPrevious = existing && (normalized.source === "direct" && normalized.medium === "none" || attributionChannel(existing.lastTouch) === "meta" && attributionChannel(normalized) !== "meta");
  return { version: 1, firstTouch: existing?.firstTouch ?? normalized,
    lastTouch: retainPrevious ? existing.lastTouch : normalized };
}
