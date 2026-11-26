/** Explicitly authorised normal admin login; business endpoints are GET-only. */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { privateDirectory } from "./baseline";

async function main() {
  if (process.argv.slice(2).join(" ") !== "--allow-admin-login")
    throw new Error("Explicit --allow-admin-login approval required");
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Existing local admin password required");
  const site = "https://www.saunahat.co.za";
  const root = resolve(".local/migration");
  await privateDirectory(root);
  let cookie: string | undefined;
  let logoutStatus: number | null = null;
  const results: {
    route: string;
    sample: number;
    status: number;
    headersMs: number;
    totalMs: number;
    bytes: number;
    regionHints: string[];
    records?: number;
    totalRecords?: number;
  }[] = [];
  try {
    const login = await fetch(`${site}/api/admin/session`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json", Origin: site },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!login.ok) throw new Error("Authorised admin login failed; no retry attempted");
    const header = login.headers.getSetCookie().find((value) => value.startsWith("smelt_admin="));
    cookie = header?.split(";")[0];
    if (!cookie) throw new Error("Admin login did not return a session");
    const routes = [
      { name: "dashboard HTML shell", path: "/admin", samples: 3 },
      { name: "active orders page 1", path: "/api/admin/orders?view=active&page=1", samples: 3 },
      {
        name: "completed orders page 1",
        path: "/api/admin/orders?view=completed&page=1",
        samples: 3,
      },
      { name: "active orders page 2", path: "/api/admin/orders?view=active&page=2", samples: 3 },
      {
        name: "order search no-match",
        path: "/api/admin/orders?search=migration-baseline-no-match&page=1",
        samples: 3,
      },
      { name: "orders CSV export", path: "/api/admin/orders/export", samples: 1 },
    ];
    for (const route of routes)
      for (let sample = 1; sample <= route.samples; sample++) {
        const start = performance.now();
        const response = await fetch(`${site}${route.path}`, {
          method: "GET",
          redirect: "manual",
          headers: { Cookie: cookie },
          cache: "no-store",
          signal: AbortSignal.timeout(120_000),
        });
        const headersMs = performance.now() - start;
        const body = await response.arrayBuffer();
        const result = {
          route: route.name,
          sample,
          status: response.status,
          headersMs,
          totalMs: performance.now() - start,
          bytes: body.byteLength,
          regionHints: (response.headers.get("x-vercel-id") || "")
            .split("::")
            .filter((part) => /^[a-z]{3}\d$/.test(part)),
          records: undefined as number | undefined,
          totalRecords: undefined as number | undefined,
        };
        if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const data = JSON.parse(Buffer.from(body).toString("utf8"));
          if (Array.isArray(data.orders)) result.records = data.orders.length;
          if (Number.isSafeInteger(data.total)) result.totalRecords = data.total;
        }
        // Customer bodies and cookies are never logged or written to disk.
        results.push(result);
        if (!response.ok)
          throw new Error("Dashboard GET benchmark failed; no response body logged");
      }
  } finally {
    if (cookie) {
      try {
        const response = await fetch(`${site}/api/admin/session`, {
          method: "DELETE",
          redirect: "manual",
          headers: { Cookie: cookie, Origin: site },
          signal: AbortSignal.timeout(30_000),
        });
        logoutStatus = response.status;
      } catch {
        logoutStatus = null;
      }
    }
    const report = {
      measuredAt: new Date().toISOString(),
      site,
      runner: "local macOS client; not a Vercel-region synthetic browser",
      authorisedOperationalWrites: [
        "normal temporary admin session",
        "login rate counters",
        "normal logout",
      ],
      businessMutations: false,
      results,
      logoutStatus,
      caveats: [
        "Small sequential sample; warm/cold and provider variability are not controlled",
        "HTML shell/API/export timing, not browser render, LCP or end-to-end interaction timing",
        "No customer body, session token or password retained",
        "Provider APIs and Redis remain authoritative; no caching or application behaviour changed",
      ],
    };
    await writeFile(
      resolve(root, `dashboard-benchmark-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
      { mode: 0o600, flag: "wx" },
    );
  }
  console.log(
    JSON.stringify(
      {
        measuredRequests: results.length,
        successfulRequests: results.filter((result) => result.status === 200).length,
        logoutStatus,
        routes: [...new Set(results.map((result) => result.route))].map((route) => {
          const values = results
            .filter((result) => result.route === route)
            .map((result) => result.totalMs)
            .sort((a, b) => a - b);
          return {
            route,
            samples: values.length,
            minMs: Math.round(values[0]),
            medianMs: Math.round(values[Math.floor(values.length / 2)]),
            maxMs: Math.round(values.at(-1)!),
          };
        }),
      },
      null,
      2,
    ),
  );
}
main().catch(() => {
  console.error(
    "Dashboard benchmark stopped; no password, cookie or customer response logged. Private metrics preserve any completed samples.",
  );
  process.exitCode = 1;
});
