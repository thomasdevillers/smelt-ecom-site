// Minimal shared-password gate for the admin dashboard and its API routes.
// The admin page sends the password in an `x-admin-password` header; we compare
// it server-side against the ADMIN_PASSWORD env var. No cookies/session flow.

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** True when the request carries the correct admin password. */
export function isAdminRequest(request: Request): boolean {
  const supplied = request.headers.get("x-admin-password") ?? "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return Boolean(expected) && supplied === expected;
}
