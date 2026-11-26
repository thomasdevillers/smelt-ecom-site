import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { researchRepository } from "./repository";
import { researchRateLimits, researchResponses } from "../db/research-schema";
import { eq } from "drizzle-orm";
import type { ResearchSave } from "./shared";

describe("research saves in isolated PostgreSQL", () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  const repository = researchRepository(db, "test");
  const input: ResearchSave = {
    token: "ab".repeat(32),
    version: 1,
    revision: 1,
    completed: false,
    answers: { frequency: "About weekly" },
  };
  const id = "cd".repeat(32);
  beforeAll(async () => {
    const migration = await readFile("drizzle/0005_product_research.sql", "utf8");
    await pg.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }, 30_000);
  afterAll(async () => {
    await pg.close();
  });
  it("creates a partial response on the first answer", async () => {
    expect(await repository.save(id, input)).toBe(1);
    const report = await repository.list(1);
    expect(report.total).toBe(1);
    expect(report.completed).toBe(0);
    expect(report.responses[0].answers).toEqual(input.answers);
    expect(report.responses[0].completedAt).toBeNull();
  });
  it("updates one response, preserving creation time and counting interest", async () => {
    const before = (await repository.list(1)).responses[0].createdAt;
    const answers = { ...input.answers, products: ["Sauna towel", "Sauna water bottle"] };
    await repository.save(id, { ...input, revision: 3, answers });
    const report = await repository.list(1);
    expect(report.total).toBe(1);
    expect(report.responses[0].createdAt).toBe(before);
    expect(report.responses[0].answers).toEqual(answers);
    expect(report.interest.find((row) => row.product === "Sauna water bottle")?.count).toBe(1);
  });
  it("ignores delayed and duplicate writes so they cannot erase newer answers", async () => {
    expect(await repository.save(id, { ...input, revision: 2 })).toBe(3);
    expect(await repository.save(id, { ...input, revision: 3 })).toBe(3);
    expect((await repository.list(1)).responses[0].answers.products).toEqual([
      "Sauna towel",
      "Sauna water bottle",
    ]);
  });
  it("marks completion and does not let stale saves reopen it", async () => {
    await repository.save(id, { ...input, revision: 4, completed: true });
    await repository.save(id, { ...input, revision: 3 });
    expect((await repository.list(1)).completed).toBe(1);
    expect((await repository.list(1)).responses[0].completedAt).not.toBeNull();
  });
  it("keeps local/test data out of production and clamps pagination", async () => {
    expect((await researchRepository(db, "production").list(1)).total).toBe(0);
    expect((await repository.list(999)).page).toBe(1);
  });
  it("limits saves using Postgres counters and resets expired counters", async () => {
    expect(await repository.allow("ip:synthetic", 2)).toBe(true);
    expect(await repository.allow("ip:synthetic", 2)).toBe(true);
    expect(await repository.allow("ip:synthetic", 2)).toBe(false);
    await db
      .update(researchRateLimits)
      .set({ expiresAt: "2020-01-01T00:00:00Z" })
      .where(eq(researchRateLimits.key, "test:ip:synthetic"));
    expect(await repository.allow("ip:synthetic", 2)).toBe(true);
    expect(await db.select().from(researchResponses)).toHaveLength(1);
  });
});
