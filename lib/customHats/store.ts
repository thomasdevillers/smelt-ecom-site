import { randomBytes, randomUUID } from "node:crypto";
import { AdminError, adminStore, digest } from "../admin/store";
import { reviewNamespace } from "../reviewNamespace";
import {
  CUSTOM_HAT_FILE_TYPES,
  CUSTOM_HAT_MAX_FILE_BYTES,
  CUSTOM_HAT_MAX_UPLOADS,
  CUSTOM_HAT_TOKEN_PATTERN,
  CustomHatValidationError,
  fileKeysOf,
  looksLikeEmail,
  validateSubmission,
  type AdminCustomHatRequest,
  type CustomHatInvite,
  type CustomHatSubmission,
} from "./shared";
import { isR2Configured, r2 } from "./storage";

// Live and test deployments share one Redis database, so keys are namespaced
// the same way reviews are (by Paystack key mode).
const prefix = () => `smelt:custom-hats:v1:${reviewNamespace()}`;
const requestsKey = () => `${prefix()}:requests`;
const tokenKey = (token: string) => `${prefix()}:token:${digest(token)}`;
const filesKey = (id: string) => `${prefix()}:files:${id}`;

interface StoredRequest {
  id: string;
  token: string;
  customer: { name: string; email: string; phone: string };
  createdAt: string;
  submittedAt: string | null;
  revision: number;
  submission: CustomHatSubmission | null;
}

function parse<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export const customHatUrl = (origin: string, token: string) => `${origin}/custom/${token}`;

export async function createCustomHatRequest(input: { name: unknown; email?: unknown; phone?: unknown }) {
  const customer = { name: clean(input.name, 120), email: clean(input.email, 200).toLowerCase(), phone: clean(input.phone, 40) };
  if (!customer.name) throw new AdminError("Add the customer's name.");
  if (customer.email && !looksLikeEmail(customer.email)) throw new AdminError("Check the email address.");
  const request: StoredRequest = {
    id: randomUUID(),
    token: randomBytes(24).toString("base64url"),
    customer,
    createdAt: new Date().toISOString(),
    submittedAt: null,
    revision: 0,
    submission: null,
  };
  const db = adminStore();
  await db.hset(requestsKey(), { [request.id]: JSON.stringify(request) });
  await db.set(tokenKey(request.token), request.id);
  return request;
}

async function getRequest(id: string) {
  return parse<StoredRequest>(await adminStore().hget(requestsKey(), id));
}

async function requestForToken(token: string) {
  if (!CUSTOM_HAT_TOKEN_PATTERN.test(token)) return null;
  const id = await adminStore().get<string>(tokenKey(token));
  return id ? getRequest(String(id)) : null;
}

/** Signed preview links for every artwork file referenced in a submission. */
async function signedFiles(submission: CustomHatSubmission | null) {
  const files: Record<string, string> = {};
  if (!submission || !isR2Configured()) return files;
  const names = new Map<string, string>();
  for (const hat of submission.hats) for (const side of [hat.front, hat.back]) if (side.fileKey) names.set(side.fileKey, side.fileName || "logo");
  await Promise.all([...names].map(async ([key, name]) => { files[key] = await r2().downloadUrl(key, name); }));
  return files;
}

export async function listCustomHatRequests(origin: string): Promise<AdminCustomHatRequest[]> {
  const all = await adminStore().hgetall<Record<string, unknown>>(requestsKey()) || {};
  const requests = Object.values(all).map(value => parse<StoredRequest>(value)).filter((r): r is StoredRequest => !!r);
  // Newest activity first: submissions jump to the top.
  requests.sort((a, b) => (b.submittedAt || b.createdAt).localeCompare(a.submittedAt || a.createdAt));
  return Promise.all(requests.map(async r => ({
    id: r.id,
    url: customHatUrl(origin, r.token),
    customer: r.customer,
    createdAt: r.createdAt,
    submittedAt: r.submittedAt,
    revision: r.revision,
    submission: r.submission,
    files: await signedFiles(r.submission).catch(() => ({})),
  })));
}

export async function deleteCustomHatRequest(id: unknown) {
  if (typeof id !== "string" || !id) throw new AdminError("Choose a request to delete.");
  const request = await getRequest(id);
  if (!request) return;
  const db = adminStore();
  const keys = (await db.smembers(filesKey(id))) as string[];
  if (keys.length && isR2Configured()) await Promise.allSettled(keys.map(key => r2().remove(key)));
  await db.del(tokenKey(request.token), filesKey(id));
  await db.hdel(requestsKey(), id);
}

export async function customHatInvite(token: string): Promise<CustomHatInvite> {
  const request = await requestForToken(token);
  if (!request) return { valid: false, error: "This design link is invalid or has been closed. Ask us for a new one." };
  return {
    valid: true,
    customer: request.customer,
    submission: request.submission,
    submittedAt: request.submittedAt,
    files: await signedFiles(request.submission).catch(() => ({})),
    uploadsEnabled: isR2Configured(),
  };
}

/** Issues a signed R2 PUT URL for one artwork file. */
export async function reserveCustomHatUpload(token: string, input: { contentType: unknown; size: unknown }) {
  const request = await requestForToken(token);
  if (!request) throw new AdminError("This design link is no longer valid.", 404);
  if (!isR2Configured()) throw new AdminError("Logo uploads are temporarily unavailable. You can describe your logo instead.", 503);
  const contentType = typeof input.contentType === "string" ? input.contentType : "";
  const extension = CUSTOM_HAT_FILE_TYPES[contentType];
  if (!extension) throw new AdminError("Logos must be PNG, JPEG, WebP, SVG or PDF files.", 415);
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0 || size > CUSTOM_HAT_MAX_FILE_BYTES) throw new AdminError("Each logo file must be 15 MB or smaller.", 413);
  const db = adminStore();
  if (await db.scard(filesKey(request.id)) >= CUSTOM_HAT_MAX_UPLOADS) throw new AdminError("Upload limit reached for this link. Send any remaining files to us directly.", 429);
  const key = `custom-hats/${reviewNamespace()}/${request.id}/${randomUUID()}.${extension}`;
  await db.sadd(filesKey(request.id), key);
  const upload = await r2().uploadUrl(key, contentType);
  return { key, ...upload };
}

export async function submitCustomHatRequest(token: string, raw: unknown) {
  const request = await requestForToken(token);
  if (!request) throw new AdminError("This design link is no longer valid.", 404);
  const db = adminStore();
  const owned = new Set((await db.smembers(filesKey(request.id))) as string[]);
  let submission: CustomHatSubmission;
  try { submission = validateSubmission(raw, key => owned.has(key)); }
  catch (error) { if (error instanceof CustomHatValidationError) throw new AdminError(error.message); throw error; }
  const previous = new Set(fileKeysOf(request.submission));
  const fresh = fileKeysOf(submission).filter(key => !previous.has(key));
  if (fresh.length) {
    if (!isR2Configured()) throw new AdminError("Logo uploads are temporarily unavailable.", 503);
    const present = await Promise.all(fresh.map(key => r2().exists(key)));
    if (present.includes(false)) throw new AdminError("A logo did not finish uploading. Remove it and upload it again.");
  }
  const saved: StoredRequest = { ...request, submission, submittedAt: new Date().toISOString(), revision: request.revision + 1 };
  await db.hset(requestsKey(), { [request.id]: JSON.stringify(saved) });
  return saved;
}
