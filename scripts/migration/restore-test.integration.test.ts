import { describe, expect, it } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { encryptArchive, privateDirectory, sha256, classify, type Snapshot } from "./baseline";

// Explicit opt-in; never opens a production connection or reads .env.local.
describe.skipIf(process.env.RUN_MIGRATION_LOCAL_REDIS_TESTS !== "1")("isolated recovery", () => {
  it("restores synthetic data of every supported Redis type with absolute TTLs", async () => {
    const directory = resolve(".local/migration", `synthetic-${Date.now()}`);
    await privateDirectory(directory);
    const socketDirectory = await mkdtemp(resolve(tmpdir(), "fixture-"));
    const socket = resolve(socketDirectory, "redis.sock");
    const binary = process.env.REDIS_TEST_BIN_DIR;
    const server = spawn(
      binary ? resolve(binary, "redis-server") : "redis-server",
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--unixsocketperm",
        "700",
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      await new Promise<void>((accept, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Fixture Redis startup timeout")),
          10_000,
        );
        server.on("error", reject);
        server.stdout.on("data", (chunk) => {
          if (/ready to accept connections/i.test(chunk.toString())) {
            clearTimeout(timeout);
            accept();
          }
        });
      });
      const cli = (...args: string[]) =>
        execFileSync(binary ? resolve(binary, "redis-cli") : "redis-cli", ["-s", socket, ...args]);
      cli("SET", "fixture:string", '{"status":"pending","id":"synthetic-provider-id"}');
      cli("HSET", "fixture:hash", "a", "1", "b", "two");
      cli("SADD", "fixture:set", "a", "b");
      cli("ZADD", "fixture:zset", "1", "a", "2", "b");
      cli("RPUSH", "fixture:list", "a", "b");
      cli("PEXPIRE", "fixture:string", "60000");
      const logical = [
        '{"status":"pending","id":"synthetic-provider-id"}',
        [
          ["a", "1"],
          ["b", "two"],
        ],
        [
          ["a", true],
          ["b", true],
        ],
        [
          ["a", "1"],
          ["b", "2"],
        ],
        ["a", "b"],
      ];
      const types = ["string", "hash", "set", "zset", "list"];
      const rows: Snapshot[] = types.map((type, index) => {
        const key = `fixture:${type}`;
        const raw = cli("--raw", "DUMP", key);
        const dump = raw.subarray(0, raw.length - 1); // redis-cli appends one newline, not part of the dump.
        return {
          kind: "redis",
          key,
          type,
          pttl: type === "string" ? 60000 : -1,
          observedAt: new Date().toISOString(),
          expiresAt: type === "string" ? new Date(Date.now() + 55000).toISOString() : null,
          cardinality: 2,
          dump: dump.toString("base64"),
          checksum: sha256(dump),
          logical: logical[index],
          classification: classify(key),
          unstable: false,
        };
      });
      const encryptionKey = randomBytes(32);
      const keyFile = resolve(directory, "synthetic.key");
      await writeFile(keyFile, encryptionKey, { mode: 0o600 });
      const env = { ...process.env, MIGRATION_TEST_KEY_FILE: keyFile };
      async function* records() {
        yield { kind: "header" };
        yield* rows;
        yield { kind: "footer", keys: rows.length, localFiles: 0 };
      }
      await encryptArchive(resolve(directory, "baseline.jsonl.gz.aes"), encryptionKey, records());
      const result = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/migration/finalize.ts", directory],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      await new Promise<void>((accept) => {
        result.stdout.on("data", (chunk) => {
          output += chunk.toString();
          if (output.includes("Waiting for completed capture")) accept();
        });
      });
      await writeFile(
        resolve(directory, "summary.json"),
        JSON.stringify({
          completedAt: new Date().toISOString(),
          archiveSha256: sha256(await readFile(resolve(directory, "baseline.jsonl.gz.aes"))),
        }),
        { mode: 0o600 },
      );
      const [code] = await once(result, "exit");
      expect(code).toBe(0);
      expect(output).toContain(
        "Capture checksum, private audit and isolated recovery verification completed.",
      );
      expect(
        JSON.parse(await readFile(resolve(directory, "restore-test.json"), "utf8")).restored,
      ).toBe(5);
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/migration/triage.ts", directory],
        { env, encoding: "utf8" },
      );
      const handoff = execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/migration/package.ts", directory],
        { env, encoding: "utf8" },
      );
      expect(handoff).toContain('"keyExcluded": true');
      expect(handoff).toContain('"offMachineEscrow": false');
      expect(handoff).toContain('"restoredKeys": 5');
    } finally {
      server.kill("SIGTERM");
      await once(server, "exit");
      await rm(socketDirectory, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
