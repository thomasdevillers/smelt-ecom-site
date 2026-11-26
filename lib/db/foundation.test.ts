import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { databaseConfig } from "./config";
import { seal, unseal } from "./secrets";
import { customHatRepository, reviewRepository } from "./repositories";
import * as schema from "./schema";
import type { ReviewRecord } from "../reviews";

const key = "ab".repeat(32);
const timestamp = "2026-10-01T12:00:00.000Z";
const review: ReviewRecord = {
  id: "existing-review",
  productId: "smelt-sauna-hat",
  orderReference: "existing-reference",
  customerEmail: "synthetic@example.invalid",
  displayName: "Synthetic",
  anonymous: true,
  rating: 5,
  body: "Synthetic review",
  colours: ["green"],
  photos: [
    {
      url: "https://synthetic.invalid/existing-photo",
      pathname: "reviews/pending/original/file.jpg",
    },
  ],
  verifiedPurchase: true,
  status: "pending",
  submittedAt: timestamp,
  publishedAt: null,
  consentVersion: "2026-09-17",
};

describe("PostgreSQL configuration fails closed", () => {
  const local = { NEON_CONNECTION_STRING: "postgresql://runtime:synthetic@localhost/synthetic" };
  it("does not require credentials until explicitly called", () => {
    expect(() => databaseConfig({})).toThrow();
    expect(databaseConfig(local).local).toBe(true);
  });
  it("rejects hosted previews without requiring extra configuration", () => {
    expect(() => databaseConfig({ ...local, VERCEL_ENV: "preview" })).toThrow();
    expect(() => databaseConfig({ ...local, VERCEL_ENV: "development" })).toThrow();
    expect(databaseConfig({ ...local, VERCEL_ENV: "production" }).local).toBe(true);
  });
  it("accepts a Neon URL and enforces certificate-verified TLS", () => {
    const remote = {
      NEON_CONNECTION_STRING:
        "postgresql://owner:synthetic@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require&uselibpqcompat=true",
    };
    const config = databaseConfig(remote);
    expect(config.local).toBe(false);
    expect(new URL(config.connectionString).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(config.connectionString).searchParams.has("uselibpqcompat")).toBe(false);
    expect(() =>
      databaseConfig({
        NEON_CONNECTION_STRING: "postgresql://owner:synthetic@neon.tech.attacker.invalid/test",
      }),
    ).toThrow();
  });
  it("uses the same login with the direct endpoint for migrations", () => {
    const env = {
      NEON_CONNECTION_STRING:
        "postgresql://owner:synthetic@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    };
    const runtime = new URL(databaseConfig(env).connectionString);
    const migration = new URL(databaseConfig(env, "migration").connectionString);
    expect(runtime.hostname).toContain("-pooler.");
    expect(migration.hostname).toBe("ep-example.eu-central-1.aws.neon.tech");
    expect(migration.username).toBe(runtime.username);
    expect(migration.password).toBe(runtime.password);
    expect(migration.pathname).toBe(runtime.pathname);
  });
  it("never returns credential-bearing validation errors", () => {
    expect(() => databaseConfig({ NEON_CONNECTION_STRING: "secret-malformed" })).toThrow(
      "Invalid PostgreSQL configuration.",
    );
  });
});

describe("authenticated secret envelopes", () => {
  it("round-trips active link material with random nonces", () => {
    const first = seal("existing-token", key, "request:1");
    expect(first).not.toContain("existing-token");
    expect(first).not.toEqual(seal("existing-token", key, "request:1"));
    expect(unseal(first, key, "request:1")).toBe("existing-token");
  });
  it("rejects wrong keys, moved envelopes and corrupted data", () => {
    const envelope = seal("existing-token", key, "request:1");
    expect(() => unseal(envelope, "cd".repeat(32), "request:1")).toThrow();
    expect(() => unseal(envelope, key, "request:2")).toThrow();
    expect(() => unseal(envelope + "x", key, "request:1")).toThrow();
    expect(() => seal("token", "short", "request:1")).toThrow();
  });
});

describe("versioned PostgreSQL schema and typed adapters (isolated WASM PostgreSQL)", () => {
  const pg = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle(pg, { schema });
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(schema.environments).values([
      { id: "test", paymentMode: "test" },
      { id: "live", paymentMode: "live" },
    ]);
    await db.insert(schema.orders).values({
      environment: "test",
      reference: review.orderReference,
      paymentStatus: "unknown",
      snapshot: {},
    });
  }, 30_000);
  afterAll(async () => {
    await pg.close();
  });

  it("applies versioned migrations repeatedly without losing data", async () => {
    expect(readMigrationFiles({ migrationsFolder: "./drizzle" }).length).toBeGreaterThan(0);
    await migrate(db, { migrationsFolder: "./drizzle" });
    expect(await db.select().from(schema.orders)).toHaveLength(1);
  });
  it("preserves business IDs, timestamps, URLs, consent and private moderation", async () => {
    const repo = reviewRepository(db, "test");
    await repo.insert(review);
    expect(await repo.find(review.id)).toEqual(review);
    expect(await repo.published(review.id)).toBeNull();
    expect(await reviewRepository(db, "live").find(review.id)).toBeNull();
  });
  it("enforces one review per order under competing inserts", async () => {
    await db.insert(schema.orders).values({
      environment: "test",
      reference: "competing-order",
      paymentStatus: "unknown",
      snapshot: {},
    });
    const competing = await Promise.allSettled(
      ["duplicate-a", "duplicate-b"].map((id) =>
        reviewRepository(db, "test").insert({ ...review, id, orderReference: "competing-order" }),
      ),
    );
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("rejects invalid states, orphan reviews and inconsistent JSON identity", async () => {
    await expect(
      db
        .update(schema.reviews)
        .set({ status: "invalid" as "pending" })
        .where(eq(schema.reviews.id, review.id)),
    ).rejects.toThrow();
    await expect(
      reviewRepository(db, "test").insert({ ...review, id: "orphan", orderReference: "missing" }),
    ).rejects.toThrow();
    await expect(
      db
        .update(schema.reviews)
        .set({ record: { ...review, status: "published" } })
        .where(eq(schema.reviews.id, review.id)),
    ).rejects.toThrow();
  });
  it("preserves source prices with integer minor units and currency", async () => {
    await expect(
      db.insert(schema.orders).values({
        environment: "test",
        reference: "bad-money",
        paymentStatus: "pending",
        snapshot: {},
        amountMinor: 500,
        currency: null,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(schema.orderItems).values({
        environment: "test",
        reference: review.orderReference,
        position: 0,
        quantity: 1,
        unitPriceMinor: -1,
        currency: "ZAR",
        snapshot: {},
      }),
    ).rejects.toThrow();
    await db.insert(schema.orderItems).values({
      environment: "test",
      reference: review.orderReference,
      position: 0,
      quantity: 2,
      unitPriceMinor: 39000,
      currency: "ZAR",
      snapshot: { name: "Historical product" },
    });
    expect((await db.select().from(schema.orderItems))[0].unitPriceMinor).toBe(39000);
  });
  it("prevents cross-environment relationships", async () => {
    await expect(
      db.insert(schema.orderItems).values({
        environment: "live",
        reference: review.orderReference,
        position: 0,
        quantity: 1,
        unitPriceMinor: 39000,
        currency: "ZAR",
        snapshot: {},
      }),
    ).rejects.toThrow();
  });
  it("allows only one active invitation and retains revoked links and expiry", async () => {
    const invite = {
      environment: "test",
      orderReference: review.orderReference,
      state: "active" as const,
      details: {},
      createdAt: timestamp,
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
    await db.insert(schema.reviewInvitations).values({ ...invite, tokenDigest: "a".repeat(64) });
    await expect(
      db.insert(schema.reviewInvitations).values({ ...invite, tokenDigest: "b".repeat(64) }),
    ).rejects.toThrow();
    await db.update(schema.reviewInvitations).set({ state: "revoked" });
    await db.insert(schema.reviewInvitations).values({ ...invite, tokenDigest: "b".repeat(64) });
    expect(await db.select().from(schema.reviewInvitations)).toHaveLength(2);
  });
  it("retains in-flight R2 ownership without touching files", async () => {
    await db.insert(schema.customRequests).values({
      environment: "test",
      id: "existing-request",
      tokenDigest: "c".repeat(64),
      customer: {},
      createdAt: timestamp,
      revision: 0,
    });
    await db.insert(schema.customFiles).values({
      environment: "test",
      requestId: "existing-request",
      fileKey: "custom-hats/test/original/file.svg",
    });
    expect(
      await customHatRepository(db, "test").ownsFile(
        "existing-request",
        "custom-hats/test/original/file.svg",
      ),
    ).toBe(true);
    expect(
      await customHatRepository(db, "live").ownsFile(
        "existing-request",
        "custom-hats/test/original/file.svg",
      ),
    ).toBe(false);
    await expect(db.delete(schema.customRequests)).rejects.toThrow();
  });
  it("rolls back multi-table business changes together", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(schema.orders).values({
          environment: "test",
          reference: "rolled-back",
          paymentStatus: "pending",
          snapshot: {},
        });
        await tx.insert(schema.customRequests).values({
          environment: "test",
          id: "rolled-back",
          tokenDigest: "d".repeat(64),
          customer: {},
          createdAt: timestamp,
          revision: 0,
        });
        throw new Error("synthetic failure");
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(schema.customRequests)
        .where(eq(schema.customRequests.id, "rolled-back")),
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.orders).where(eq(schema.orders.reference, "rolled-back")),
    ).toHaveLength(0);
  });
  it("keeps mixed admin storage and file-provider integrations separate from PostgreSQL", async () => {
    for (const path of ["lib/admin/store.ts", "lib/customHats/storage.ts"]) {
      expect(await readFile(path, "utf8")).not.toMatch(
        /db\/(client|schema|order-domain)|postgresStore/,
      );
    }
  });
});
