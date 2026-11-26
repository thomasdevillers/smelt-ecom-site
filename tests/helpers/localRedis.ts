import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const execute = promisify(execFile);
const binary = (name: string) =>
  process.env.REDIS_TEST_BIN_DIR ? join(process.env.REDIS_TEST_BIN_DIR, name) : name;
const encode = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
const decode = (value: string | null) => {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/** Real Lua execution in an empty Unix-socket-only Redis; no production credentials. */
export async function startLocalRedis() {
  const directory = await mkdtemp(join(tmpdir(), "smelt-test-"));
  const socket = join(directory, "redis.sock");
  const server = spawn(
    binary("redis-server"),
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
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Local Redis startup timed out")), 10_000);
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Local Redis exited before becoming ready"));
      });
      server.stdout.on("data", (data) => {
        if (/ready to accept connections/i.test(String(data))) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } catch (error) {
    server.kill();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const command = async (...args: string[]) => {
    const { stdout } = await execute(binary("redis-cli"), ["-s", socket, "--json", ...args], {
      timeout: 10_000,
    });
    if (stdout.startsWith("error:")) throw new Error(stdout);
    return JSON.parse(stdout);
  };
  const db = {
    eval<Args extends unknown[] = unknown[], Result = unknown>(
      script: string,
      keys: string[],
      args: Args,
    ): Promise<Result> {
      return command("EVAL", script, String(keys.length), ...keys, ...args.map(encode));
    },
    async hget(key: string, field: string) {
      return decode(await command("HGET", key, field));
    },
    async hgetall(key: string) {
      const result = await command("HGETALL", key);
      const pairs = Array.isArray(result)
        ? Array.from({ length: result.length / 2 }, (_, i) => [result[i * 2], result[i * 2 + 1]])
        : Object.entries(result);
      return Object.fromEntries(pairs.map(([field, value]) => [field, decode(value)]));
    },
    hset: (key: string, fields: Record<string, unknown>) =>
      command(
        "HSET",
        key,
        ...Object.entries(fields).flatMap(([field, value]) => [field, encode(value)]),
      ),
    get: async (key: string) => decode(await command("GET", key)),
    set: (key: string, value: unknown, options?: { ex?: number }) =>
      command("SET", key, encode(value), ...(options?.ex ? ["EX", String(options.ex)] : [])),
    del: (...keys: string[]) => command("DEL", ...keys),
    expire: (key: string, seconds: number) => command("EXPIRE", key, String(seconds)),
  };
  return {
    db,
    async close() {
      if (server.exitCode === null) {
        server.kill("SIGTERM");
        await once(server, "exit");
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
