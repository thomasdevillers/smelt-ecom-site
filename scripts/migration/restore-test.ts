/** Restores only into a fresh, disposable, Unix-socket-only local Redis process. */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { decryptArchive, logicalValue, privateDirectory, sha256, type Snapshot, type Source } from "./baseline";

type Reply = string | number | Buffer | null | Reply[];
function reply(buffer: Buffer, offset = 0): { value: Reply; end: number; error?: boolean } | null {
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd < 0) return null;
  const prefix = String.fromCharCode(buffer[offset]);
  const line = buffer.subarray(offset + 1, lineEnd).toString();
  let end = lineEnd + 2;
  if (prefix === "$") {
    const size = Number(line);
    if (size < 0) return { value: null, end };
    if (buffer.length < end + size + 2) return null;
    return { value: Buffer.from(buffer.subarray(end, end + size)), end: end + size + 2 };
  }
  if (prefix === "*") {
    const values: Reply[] = [];
    for (let i = 0; i < Number(line); i++) {
      const item = reply(buffer, end);
      if (!item) return null;
      values.push(item.value); end = item.end;
    }
    return { value: values, end };
  }
  return { value: prefix === ":" ? Number(line) : line, end, error: prefix === "-" };
}
function text(value: Reply): unknown {
  return Buffer.isBuffer(value) ? value.toString("utf8") : Array.isArray(value) ? value.map(text) : value;
}

function resp(command: (string | Buffer)[]) {
  return Buffer.concat([Buffer.from(`*${command.length}\r\n`), ...command.flatMap(value => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return [Buffer.from(`$${bytes.length}\r\n`), bytes, Buffer.from("\r\n")];
  })]);
}

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (process.argv.length !== 3 || !directory.startsWith(resolve(".local/migration") + "/")) throw new Error("Private baseline directory required");
  const key = await readFile(resolve(".local/migration/backup.key"));
  const rows: Snapshot[] = [];
  let footer: { keys: number; localFiles: number } | undefined;
  let localFiles = 0;
  for await (const raw of decryptArchive(resolve(directory, "baseline.jsonl.gz.aes"), key)) {
    const row = raw as Snapshot;
    if (row.kind === "redis") {
      if (!row.dump || sha256(Buffer.from(row.dump, "base64")) !== row.checksum) throw new Error("Invalid dump checksum");
      rows.push(row);
    } else if ((raw as { kind: string }).kind === "local") {
      const file = raw as { content: string; checksum: string };
      if (sha256(file.content) !== file.checksum) throw new Error("Invalid local file checksum");
      localFiles++;
    } else if ((raw as { kind: string }).kind === "footer") footer = raw as typeof footer;
  }
  if (!footer || footer.keys !== rows.length || footer.localFiles !== localFiles) throw new Error("Incomplete archive");
  const scratch = resolve(directory, `restore-${Date.now()}`);
  await privateDirectory(scratch);
  // macOS Unix socket paths must stay short; the repo path can exceed their limit.
  const socketDirectory = await mkdtemp(resolve(tmpdir(), "opencode/smelt-"));
  const socket = resolve(socketDirectory, "redis.sock");
  const server = spawn(resolve(".local/migration/redis-8.8.0/src/redis-server"), ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no", "--dir", scratch, "--logfile", ""], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const ready = new Promise<void>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error("Local Redis startup timeout")), 15_000);
    server.on("error", reject);
    server.on("exit", () => { clearTimeout(timeout); reject(new Error("Local Redis exited")); });
    server.stdout.on("data", chunk => { output += chunk.toString(); if (output.includes("ready to accept connections") || output.includes("Ready to accept connections")) { clearTimeout(timeout); accept(); } });
  });
  let client: ReturnType<typeof createConnection> | undefined;
  try {
    await ready;
    client = createConnection({ path: socket });
    await once(client, "connect");
    let pending = Buffer.alloc(0);
    const waiting: { resolve: (value: Reply) => void; reject: (error: Error) => void }[] = [];
    client.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (waiting.length) {
        const result = reply(pending);
        if (!result) return;
        const job = waiting.shift()!;
        pending = pending.subarray(result.end);
        if (result.error) {
          // Preserve detailed diagnostics privately, never in terminal output.
          void writeFile(resolve(scratch, "redis-error.private.json"), JSON.stringify({ error: String(result.value) }), { mode: 0o600 });
          job.reject(new Error("Local Redis rejected restore/validation command"));
        }
        else job.resolve(result.value);
      }
    });
    client.on("error", () => { for (const job of waiting.splice(0)) job.reject(new Error("Local restore connection failed")); });
    const command = (args: (string | Buffer)[]) => new Promise<Reply>((accept, reject) => {
      waiting.push({ resolve: accept, reject }); client!.write(resp(args));
    });
    if (await command(["DBSIZE"]) !== 0) throw new Error("Restore target must be empty");
    let restored = 0, expired = 0;
    const types: Record<string, number> = {};
    for (const row of rows) {
      if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) { expired++; continue; }
      // Absolute expiry semantics; never extend source TTL by restoring the old relative TTL.
      const ttl = row.expiresAt ? String(Date.parse(row.expiresAt)) : "0";
      await command(["RESTORE", row.key, ttl, Buffer.from(row.dump!, "base64"), ...(row.expiresAt ? ["ABSTTL"] : [])]);
      const type = await command(["TYPE", row.key]);
      if (type !== row.type) throw new Error("Restored type mismatch");
      // Redis versions/encodings may serialize equal values into different DUMP bytes.
      // Compare canonical logical values instead of requiring byte-identical reserialization.
      const adapter = { command: async (args: (string | number)[]) => text(await command(args.map(String))) } as unknown as Source;
      const restoredLogical = await logicalValue(adapter, row.key, row.type);
      if (!["string", "hash", "set", "zset", "list"].includes(row.type) || JSON.stringify(restoredLogical) !== JSON.stringify(row.logical)) throw new Error("Restored logical value mismatch or unsupported type");
      const pttl = Number(await command(["PTTL", row.key]));
      if (row.expiresAt ? pttl < 0 || Math.abs(pttl - (Date.parse(row.expiresAt) - Date.now())) > 2000 : pttl !== -1) throw new Error("Restored expiry mismatch");
      restored++; types[row.type] = (types[row.type] || 0) + 1;
    }
    if (Number(await command(["DBSIZE"])) !== restored) throw new Error("Restored key count mismatch");
    const report = { completedAt: new Date().toISOString(), verifiedArchive: true, sourceKeys: rows.length, restored, skippedExpired: expired,
      verifiedLocalFileChecksums: localFiles, types, verified: ["AES-GCM authentication before restore", "source dump checksums", "fresh isolated Unix-socket-only Redis", "RESTORE accepted", "canonical logical value equality", "types", "absolute expiries", "key count"],
      caveats: ["Online source capture is not a point-in-time snapshot", "External files remain in original providers and were not restored", "Local audit artifacts checksum-verified, not written back to original locations"] };
    await writeFile(resolve(directory, "restore-test.json"), JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client?.destroy();
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  }
}
main().catch(error => {
  const safe = new Set(["Invalid dump checksum", "Invalid local file checksum", "Incomplete archive", "Local Redis startup timeout", "Local Redis exited", "Local Redis rejected restore/validation command", "Local restore connection failed", "Restore target must be empty", "Restored type mismatch", "Restored logical value mismatch or unsupported type", "Restored expiry mismatch", "Restored key count mismatch"]);
  console.error(`Isolated restore test failed: ${error instanceof Error && safe.has(error.message) ? error.message : "local setup or archive authentication error"}. No production actions attempted.`);
  process.exitCode = 1;
});
