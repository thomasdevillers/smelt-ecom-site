export function databaseConfig(env: Record<string, string | undefined>, purpose: "runtime" | "migration" = "runtime") {
  // One project/login. Local operator tools may connect; ordinary Vercel
  // previews must never use the production database, even if its URL is copied.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
    throw new Error("Neon access is disabled in Vercel previews/development.");
  const value = env.NEON_CONNECTION_STRING;
  if (!value) throw new Error("NEON_CONNECTION_STRING is not configured.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid PostgreSQL configuration."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.pathname.slice(1))
    throw new Error("Invalid PostgreSQL configuration.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local) {
    if (!url.hostname.endsWith(".neon.tech")) throw new Error("Expected a Neon PostgreSQL connection.");
    // Normalize Neon's default sslmode=require to certificate-verified TLS.
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.delete("uselibpqcompat");
    // Same database and login; schema tooling needs a session-affine direct
    // endpoint rather than transaction pooling. No second secret is required.
    if (purpose === "migration") url.hostname = url.hostname.replace("-pooler.", ".");
  }
  return { connectionString: url.toString(), local };
}
