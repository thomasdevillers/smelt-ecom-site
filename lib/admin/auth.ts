import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminStore, AdminError, digest } from "./store";

export const SESSION_COOKIE = "smelt_admin";
export const SESSION_SECONDS = 12 * 60 * 60;
const MIN_PASSWORD_LENGTH = 5;
const sessionKey = (token: string) => `smelt:admin:session:v1:${digest(token)}`;
function password() {
  const value = process.env.ADMIN_PASSWORD;
  if (!value || value.length < MIN_PASSWORD_LENGTH) throw new AdminError("Admin access has not been configured.", 503);
  return value;
}
export function passwordMatches(input: string) {
  return timingSafeEqual(Buffer.from(digest(input)), Buffer.from(digest(password())));
}
export async function hasAdminSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const session = await adminStore().get<{ credential: string }>(sessionKey(token));
  return !!session && session.credential === digest(password());
}
export async function requireAdmin() {
  if (!await hasAdminSession()) throw new AdminError("Please sign in to continue.", 401);
}
export const LOGIN_LIMIT = `
local ip = redis.call('INCR', KEYS[1])
if ip == 1 then redis.call('EXPIRE', KEYS[1], 900) end
local total = redis.call('INCR', KEYS[2])
if total == 1 then redis.call('EXPIRE', KEYS[2], 900) end
if ip > 10 or total > 100 then return 0 end
return 1`;
export async function login(request: Request, input: unknown) {
  password();
  // Vercel sets this header itself. Elsewhere use a shared limit rather than trusting supplied IPs.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") || "unknown" : "local";
  const db = adminStore();
  const allowed = await db.eval(LOGIN_LIMIT, [`smelt:admin:login:${digest(ip)}`, "smelt:admin:login:total"], []);
  if (!allowed) throw new AdminError("Too many sign-in attempts. Try again in 15 minutes.", 429);
  if (typeof input !== "string" || !passwordMatches(input)) throw new AdminError("Incorrect password.", 401);
  const token = randomBytes(32).toString("hex");
  await db.set(sessionKey(token), { credential: digest(password()) }, { ex: SESSION_SECONDS });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await adminStore().del(sessionKey(token));
  jar.delete(SESSION_COOKIE);
}
