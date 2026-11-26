/** Prepare and locally verify a handoff bundle. Never includes its encryption key or uploads anything. */
import { spawn } from "node:child_process";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { privateDirectory, sha256 } from "./baseline";

async function command(file: string, args: string[], inherit = false): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(file, args, { stdio: ["ignore", inherit ? "inherit" : "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => reject(new Error("Local handoff command could not start")));
    child.on("exit", (code) =>
      code === 0 ? accept(output) : reject(new Error("Local handoff verification failed")),
    );
  });
}

async function main() {
  const source = resolve(process.argv[2] || "");
  if (process.argv.length !== 3 || !source.startsWith(resolve(".local/migration") + "/"))
    throw new Error("Private verified baseline directory required");
  const root = resolve(".local/migration", `handoff-${Date.now()}`);
  const payload = resolve(root, "payload"),
    verification = resolve(root, "verification");
  await privateDirectory(root);
  await privateDirectory(payload);
  await privateDirectory(verification);
  const files = [
    "baseline.jsonl.gz.aes",
    "baseline.jsonl.gz.aes.tag",
    "summary.json",
    "triage.jsonl.gz.aes",
    "triage.jsonl.gz.aes.tag",
    "triage-summary.json",
  ];
  const checksums: Record<string, string> = {};
  for (const name of files) {
    const bytes = await readFile(resolve(source, name));
    checksums[name] = sha256(bytes);
    await writeFile(resolve(payload, name), bytes, { mode: 0o600, flag: "wx" });
  }
  for (const name of [
    "comparison-summary.json",
    "provider-reconciliation.jsonl.gz.aes",
    "provider-reconciliation.jsonl.gz.aes.tag",
    "provider-reconciliation-summary.json",
  ]) {
    let bytes: Buffer;
    try {
      bytes = await readFile(resolve(source, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    checksums[name] = sha256(bytes);
    await writeFile(resolve(payload, name), bytes, { mode: 0o600, flag: "wx" });
  }
  const priorRestore = await readFile(resolve(source, "restore-test.json"));
  const restore = JSON.parse(priorRestore.toString());
  if (restore.verifiedArchive !== true) throw new Error("Source recovery is not verified");
  await writeFile(resolve(payload, "source-restore-test.json"), priorRestore, {
    mode: 0o600,
    flag: "wx",
  });
  checksums["source-restore-test.json"] = sha256(priorRestore);
  const note =
    "# Encrypted Redis recovery handoff\n\nNo encryption key, credentials, plaintext customer records or external files are included.\n\nKeep this archive separate from the 32-byte backup.key, which must be delivered through an independently approved secure channel. Never commit either to Git or paste the key in chat.\n\nThis is a locally tested online baseline, not a point-in-time snapshot or production restore authorisation. Preserve both .aes and .tag files. The source restore requires a local Redis 8.8.0 binary (RDB v14). Customer artwork/photos remain with their original storage providers. Local artifact contents are encrypted inside the baseline.\n\nNo off-machine escrow has occurred. User selected local handoff only.\n";
  await writeFile(resolve(payload, "README.md"), note, { mode: 0o600, flag: "wx" });
  const manifest = {
    preparedAt: new Date().toISOString(),
    sourceCapture: source.split("/").at(-1),
    files: checksums,
    excludesEncryptionKey: true,
    offMachineEscrow: false,
  };
  await writeFile(resolve(payload, "manifest.json"), JSON.stringify(manifest, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  const archive = resolve(root, "encrypted-baseline-handoff.tar.gz");
  await command("tar", ["-czf", archive, "-C", payload, "."]);
  await chmod(archive, 0o600);
  const listing = (await command("tar", ["-tzf", archive])).trim().split("\n");
  const allowed = new Set([
    "./",
    ...Object.keys(checksums).map((name) => `./${name}`),
    "./README.md",
    "./manifest.json",
  ]);
  if (listing.some((name) => !allowed.has(name)))
    throw new Error("Unexpected file in handoff package");
  await command("tar", ["-xzf", archive, "-C", verification]);
  for (const [name, checksum] of Object.entries(checksums))
    if (sha256(await readFile(resolve(verification, name))) !== checksum)
      throw new Error("Extracted handoff checksum mismatch");
  await command(
    process.execPath,
    ["--import", "tsx", resolve("scripts/migration/restore-test.ts"), verification],
    true,
  );
  // The extracted copy is verified with the separately held local key; it is never packaged.
  const verificationReport = JSON.parse(
    await readFile(resolve(verification, "restore-test.json"), "utf8"),
  );
  const report = {
    completedAt: new Date().toISOString(),
    archive,
    archiveSha256: sha256(await readFile(archive)),
    keyExcluded: true,
    offMachineEscrow: false,
    extractedFileChecksumsVerified: true,
    restoredKeys: verificationReport.restored,
    localArtifactChecksumsVerified: verificationReport.verifiedLocalFileChecksums,
    caveat:
      "Local packaging/extraction/recovery verified only; user deferred external transfer and separate off-machine key escrow",
  };
  await writeFile(resolve(root, "handoff-verification.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => {
  console.error(
    "Local handoff preparation/verification failed; no archive or key uploaded and no private contents logged.",
  );
  process.exitCode = 1;
});
