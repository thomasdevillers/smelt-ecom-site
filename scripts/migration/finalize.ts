/** Event-driven follow-up for a running capture; does not poll Redis or local files. */
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { sha256 } from "./baseline";

async function main() {
  const directory = resolve(process.argv[2] || "");
  if (process.argv.length !== 3 || !directory.startsWith(resolve(".local/migration") + "/"))
    throw new Error("Private baseline directory required");
  const summaryFile = resolve(directory, "summary.json");
  await new Promise<void>((accept, reject) => {
    let checking = false;
    let pendingEvent = false;
    const watcher = watch(directory, (_event, filename) => {
      if (filename?.toString() !== "summary.json") return;
      if (checking) pendingEvent = true;
      else void check();
    });
    const timeout = setTimeout(
      () => {
        watcher.close();
        reject(new Error("Capture did not complete within 45 minutes; no follow-up attempted"));
      },
      45 * 60 * 1000,
    );
    watcher.on("error", (error) => {
      clearTimeout(timeout);
      watcher.close();
      reject(error);
    });
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const summary = JSON.parse(await readFile(summaryFile, "utf8")) as {
          archiveSha256?: string;
          completedAt?: string;
        };
        if (!summary.archiveSha256 || !summary.completedAt) throw new Error("Incomplete summary");
        clearTimeout(timeout);
        watcher.close();
        accept();
      } catch (error) {
        checking = false;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) {
          clearTimeout(timeout);
          watcher.close();
          reject(new Error("Capture summary is invalid"));
        } else if (pendingEvent) {
          pendingEvent = false;
          void check();
        }
      }
    }
    // Watch before the initial read to avoid a completion race. Further checks are filesystem-event driven.
    console.log("Waiting for completed capture via filesystem events; no source requests.");
    void check();
  });
  const summary = JSON.parse(await readFile(summaryFile, "utf8")) as { archiveSha256: string };
  if (sha256(await readFile(resolve(directory, "baseline.jsonl.gz.aes"))) !== summary.archiveSha256)
    throw new Error("Archive does not match capture checksum");
  for (const script of ["audit.ts", "restore-test.ts"]) {
    await new Promise<void>((accept, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", resolve("scripts/migration", script), directory],
        { stdio: "inherit" },
      );
      child.on("error", () => reject(new Error("Local follow-up could not start")));
      child.on("exit", (code) =>
        code === 0
          ? accept()
          : reject(new Error(`Local ${script} failed; no production actions attempted`)),
      );
    });
  }
  console.log("Capture checksum, private audit and isolated recovery verification completed.");
}
main().catch((error) => {
  console.error(
    error instanceof Error && /^(Capture|Archive|Local|Private)/.test(error.message)
      ? error.message
      : "Baseline follow-up failed; no source data logged",
  );
  process.exitCode = 1;
});
