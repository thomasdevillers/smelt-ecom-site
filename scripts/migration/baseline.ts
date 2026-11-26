import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, relative, extname } from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { Readable } from "node:stream";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const destinations: Record<string, string> = {
  reviews: "Neon: reviews, invitations, claims, consent, rankings and photo metadata",
  "custom-hats": "Neon: design requests, submissions, revisions, token lookups and R2 ownership",
  inventory:
    "Neon: stock, reservations, expiry reconciliation, committed references and adjustment audit history",
  preorders: "Neon: batches, capacity, purchase allocations and received markers",
  coupons: "Neon: coupons, reservations and redemption ledger",
  vouchers: "Neon: balances, reservations, rewards and reward jobs",
  orders: "Neon: completion and review-message timestamps",
  shipping: "Neon: order shipments, email/waybill receipts and history",
  "order-confirmation": "Neon: customer confirmation receipts and frozen pending messages",
  "owner-order": "Neon: owner confirmation receipts and frozen pending messages",
  "review-outreach": "Neon: request/reward receipts and durable jobs",
  "review-refund-campaign": "Neon: historical campaign receipts and delivery observations",
  "customer-thank-you": "Neon: campaign recipients, send history and safety counters",
  "email-audit": "Neon: audit reports and handled resolutions",
  followup: "Neon: checkout leads, consent, notice receipts and due jobs",
  "cart-email": "Neon: campaigns, receipts, recovery/unsubscribe links and suppressions",
  restock: "Neon: restock requests and notification history",
  "restock-email": "Neon: email restock subscriptions and notification history",
  conversations: "Neon: saved conversations, turn metadata and turns; retention requires approval",
  "ask-hat": "Redis: short-lived question rate limits",
  admin: "Redis: sessions and login rate limits",
};

export function classify(key: string) {
  const parts = key.split(":");
  const family =
    parts[1] === "ask-hat" && parts[2] === "conversations" ? "conversations" : parts[1];
  const versionKnown =
    family === "admin"
      ? parts[2] === "login" || (parts[2] === "session" && parts[3] === "v1")
      : ["conversations", "orders", "shipping"].includes(family)
        ? parts[3] === "v1"
        : parts[2] === "v1";
  const known = parts[0] === "smelt" && Object.hasOwn(destinations, family) && versionKnown;
  let environment = "ambiguous";
  // Ownership must come from the namespace's documented position, never IDs or payloads.
  const slot = family === "conversations" || family === "orders" ? parts[4] : parts[3];
  if (!["shipping", "order-confirmation", "owner-order", "followup", "admin"].includes(family)) {
    if (
      [
        "live",
        "test",
        "local-preorder-test",
        "production",
        "preview",
        "development",
        "local",
      ].includes(slot)
    )
      environment = slot;
  }
  const operational =
    family === "admin" ||
    family === "ask-hat" ||
    /:(access-rate|validate-rate|lock|request-lock|reward-lock)(:|$)/.test(key) ||
    (family === "conversations" ? false : /:ranking:lock:/.test(key));
  const correction = family === "inventory" && parts[4] === "correction";
  return {
    family: known ? family : "unknown",
    environment,
    destination: !known
      ? "Quarantine: owner and schema review required"
      : operational
        ? "Redis: temporary operational state"
        : destinations[family],
    decision: !known
      ? "quarantine"
      : correction
        ? "retain; quarantine adjustment provenance"
        : environment === "ambiguous" && !operational
          ? "retain; quarantine environment ownership"
          : operational
            ? "retain operational TTL"
            : "retain; migrate preserving expiry",
  };
}

export type Command = (string | number)[];
const readOnly = new Set([
  "SCAN",
  "TYPE",
  "PTTL",
  "PEXPIRETIME",
  "DUMP",
  "GET",
  "HSCAN",
  "SSCAN",
  "ZSCAN",
  "LRANGE",
  "STRLEN",
  "HLEN",
  "SCARD",
  "ZCARD",
  "LLEN",
  "DBSIZE",
  "INFO",
]);
export class Source {
  requests = 0;
  durations: number[] = [];
  constructor(
    private url: string,
    private token: string,
  ) {
    if (new URL(url).protocol !== "https:") throw new Error("HTTPS Redis endpoint required");
  }
  async batch(commands: Command[], base64 = false): Promise<unknown[]> {
    if (!commands.length || commands.some((c) => !readOnly.has(String(c[0]))))
      throw new Error("Only allowlisted read commands are permitted");
    const started = performance.now();
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(base64 ? { "Upstash-Encoding": "base64" } : {}),
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(30_000),
    });
    this.requests += commands.length;
    this.durations.push(performance.now() - started);
    if (!response.ok)
      throw new Error(`Redis read failed (HTTP ${response.status}); no provider payload logged`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    if (
      !Array.isArray(results) ||
      results.length !== commands.length ||
      results.some((r) => r.error)
    )
      throw new Error("Redis read rejected; no provider payload logged");
    return results.map((r) => r.result);
  }
  async command(command: Command) {
    return (await this.batch([command]))[0];
  }
}

export type Snapshot = {
  kind: "redis";
  key: string;
  type: string;
  pttl: number;
  observedAt: string;
  expiresAt: string | null;
  cardinality: number;
  dump: string | null;
  checksum: string | null;
  logical: unknown;
  classification: ReturnType<typeof classify>;
  unstable: boolean;
};

export async function logicalValue(source: Source, key: string, type: string): Promise<unknown> {
  if (type === "string") return source.command(["GET", key]);
  if (type === "list") {
    const values: unknown[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = (await source.command(["LRANGE", key, offset, offset + 99])) as unknown[];
      values.push(...page);
      if (page.length < 100) return values;
    }
  }
  if (!["hash", "set", "zset"].includes(type)) return null;
  const entries = new Map<string, unknown>();
  let cursor = "0";
  do {
    const [next, values] = (await source.command([
      { hash: "HSCAN", set: "SSCAN", zset: "ZSCAN" }[type]!,
      key,
      cursor,
      "COUNT",
      100,
    ])) as [string, string[]];
    cursor = String(next);
    for (let i = 0; i < values.length; i += type === "set" ? 1 : 2)
      entries.set(values[i], type === "set" ? true : values[i + 1]);
  } while (cursor !== "0");
  return [...entries].sort(([a], [b]) => a.localeCompare(b));
}

export async function snapshot(source: Source, key: string): Promise<Snapshot | null> {
  const observedAt = new Date().toISOString();
  const [type, pttl, expiry] = (await source.batch([
    ["TYPE", key],
    ["PTTL", key],
    ["PEXPIRETIME", key],
  ])) as [string, number, number];
  if (type === "none" || pttl === -2 || expiry === -2) return null;
  const countCommand = {
    string: "STRLEN",
    hash: "HLEN",
    set: "SCARD",
    zset: "ZCARD",
    list: "LLEN",
  }[type];
  const cardinality = countCommand ? Number(await source.command([countCommand, key])) : -1;
  const dump = (await source.batch([["DUMP", key]], true))[0] as string | null;
  const logical = await logicalValue(source, key, type);
  // Flag possible changes (or different DUMP serialization) around logical reads.
  // This is still NOT an atomic database snapshot.
  const [after, afterExpiry] = (await source.batch(
    [
      ["DUMP", key],
      ["PEXPIRETIME", key],
    ],
    true,
  )) as [string | null, number];
  return {
    kind: "redis",
    key,
    type,
    pttl,
    observedAt,
    expiresAt: expiry >= 0 ? new Date(expiry).toISOString() : null,
    cardinality,
    dump,
    checksum: dump === null ? null : sha256(Buffer.from(dump, "base64")),
    logical,
    classification: classify(key),
    unstable: dump === null || dump !== after || expiry !== afterExpiry,
  };
}

/** Bounded pipelining avoids thousands of separate transcontinental HTTP round trips. */
export async function snapshotMany(source: Source, keys: string[]): Promise<(Snapshot | null)[]> {
  if (!keys.length || keys.length > 25) throw new Error("Snapshot batch must contain 1–25 keys");
  const types = (await source.batch(keys.map((key) => ["TYPE", key]))) as string[];
  const observedAt = new Date().toISOString();
  const metadata = (await source.batch(
    keys.flatMap((key, i) => {
      const count = { string: "STRLEN", hash: "HLEN", set: "SCARD", zset: "ZCARD", list: "LLEN" }[
        types[i]
      ];
      return [
        ["PTTL", key],
        ["PEXPIRETIME", key],
        [count || "PTTL", key],
      ];
    }),
  )) as number[];
  const dumps = (await source.batch(
    keys.map((key) => ["DUMP", key]),
    true,
  )) as (string | null)[];
  const logical = new Map<string, unknown>();
  const strings = keys.filter((_, i) => types[i] === "string");
  if (strings.length) {
    const values = await source.batch(strings.map((key) => ["GET", key]));
    strings.forEach((key, i) => logical.set(key, values[i]));
  }
  await Promise.all(
    keys.map(async (key, i) => {
      if (!["string", "none"].includes(types[i]))
        logical.set(key, await logicalValue(source, key, types[i]));
    }),
  );
  const after = await source.batch(
    keys.flatMap((key) => [
      ["DUMP", key],
      ["PEXPIRETIME", key],
    ]),
    true,
  );
  return Promise.all(
    keys.map(async (key, i) => {
      const [pttl, expiry, cardinality] = metadata.slice(i * 3, i * 3 + 3);
      if (types[i] === "none" || pttl === -2 || expiry === -2) return null;
      const dump = dumps[i];
      let unstable = dump === null || after[i * 2] === null || expiry !== after[i * 2 + 1];
      // Collection serialization order is not a logical mutation. Re-read semantically when bytes differ.
      if (dump !== after[i * 2])
        unstable ||=
          JSON.stringify(logical.get(key)) !==
          JSON.stringify(await logicalValue(source, key, types[i]));
      return {
        kind: "redis",
        key,
        type: types[i],
        pttl,
        observedAt,
        expiresAt: expiry >= 0 ? new Date(expiry).toISOString() : null,
        cardinality,
        dump,
        checksum: dump === null ? null : sha256(Buffer.from(dump, "base64")),
        logical: logical.get(key),
        classification: classify(key),
        unstable,
      } satisfies Snapshot;
    }),
  );
}

// The encryption key never enters a backup or a tracked file. Each archive has a fresh nonce.
export async function encryptArchive(file: string, key: Buffer, records: AsyncIterable<unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  output.write(Buffer.concat([Buffer.from("SMELT01"), iv]));
  async function* lines() {
    for await (const record of records) yield JSON.stringify(record) + "\n";
  }
  await pipeline(Readable.from(lines()), createGzip(), cipher, output);
  await writeFile(`${file}.tag`, cipher.getAuthTag(), { flag: "wx", mode: 0o600 });
}

export async function* decryptArchive(file: string, key: Buffer): AsyncGenerator<unknown> {
  const header = Buffer.alloc(19);
  const stream = createReadStream(file, { start: 0, end: 18 });
  let offset = 0;
  for await (const chunk of stream) {
    chunk.copy(header, offset);
    offset += chunk.length;
  }
  if (offset !== 19 || header.subarray(0, 7).toString() !== "SMELT01")
    throw new Error("Invalid backup format");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(7));
  decipher.setAuthTag(await readFile(`${file}.tag`));
  // Authenticate the complete ciphertext BEFORE yielding any plaintext to a restore caller.
  const verifier = createDecipheriv("aes-256-gcm", key, header.subarray(7));
  verifier.setAuthTag(await readFile(`${file}.tag`));
  for await (const chunk of createReadStream(file, { start: 19 })) verifier.update(chunk);
  verifier.final();
  const input = createReadStream(file, { start: 19 });
  const gunzip = createGunzip();
  const completion = pipeline(input, decipher, gunzip);
  // Attach immediately so corrupt input cannot cause an unhandled rejection.
  completion.catch(() => {});
  try {
    for await (const line of createInterface({ input: gunzip, crlfDelay: Infinity }))
      yield JSON.parse(line);
    await completion;
  } finally {
    input.destroy();
    decipher.destroy();
    gunzip.destroy();
  }
}

export async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

export async function* localRecords(
  directory = resolve(".local"),
): AsyncGenerator<{ kind: "local"; path: string; checksum: string; content: string }> {
  async function* walk(dir: string): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = resolve(dir, entry.name);
      if (
        entry.isDirectory() &&
        !["migration", "admin", "node_modules", ".git"].includes(entry.name)
      )
        yield* walk(file);
      else if (entry.isFile() && [".json", ".jsonl", ".csv", ".log"].includes(extname(file)))
        yield file;
    }
  }
  for await (const file of walk(directory)) {
    if ((await stat(file)).size > 50 * 1024 * 1024)
      throw new Error("Local audit file exceeds 50 MiB; review privately before continuing");
    const content = await readFile(file, "utf8");
    yield { kind: "local", path: relative(resolve("."), file), checksum: sha256(content), content };
  }
}
