// Cloudflare R2 storage for custom-hat artwork. Browsers upload and download
// directly with short-lived signed URLs, so files never pass through Vercel.
//
// Env (server only):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_BUCKET – the bucket name, or the bucket's S3 API URL from the dashboard.
import { AwsClient } from "aws4fetch";

interface R2Settings { host?: string; bucket?: string; accessKeyId?: string; secretAccessKey?: string }

export function r2Settings(env: Record<string, string | undefined> = process.env): R2Settings {
  let account = env.R2_ACCOUNT_ID?.trim();
  let bucket = env.R2_BUCKET?.trim();
  // EU-jurisdiction buckets live under <account>.eu.r2.cloudflarestorage.com.
  const url = bucket?.match(/^https:\/\/([a-f0-9]+)\.((?:[a-z]+\.)?)r2\.cloudflarestorage\.com\/([^/]+)\/?$/);
  let jurisdiction = "";
  if (url) { account ||= url[1]; jurisdiction = url[2]; bucket = url[3]; }
  return {
    host: account ? `${account}.${jurisdiction}r2.cloudflarestorage.com` : undefined,
    bucket,
    accessKeyId: env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY?.trim(),
  };
}

export function isR2Configured() {
  const s = r2Settings();
  return !!(s.host && s.bucket && s.accessKeyId && s.secretAccessKey && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(s.bucket));
}

function disposition(fileName: string, inline: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

let shared: ReturnType<typeof createClient> | null = null;
function createClient() {
  const { host, bucket, accessKeyId, secretAccessKey } = r2Settings();
  if (!isR2Configured() || !host || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2 is not configured.");
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const objectUrl = (key: string) => new URL(`https://${host}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const presign = async (url: URL, method: string, headers: Record<string, string>, seconds: number) => {
    url.searchParams.set("X-Amz-Expires", String(seconds));
    // allHeaders: also sign Content-Type, which aws4fetch skips by default.
    return (await aws.sign(new Request(url, { method, headers }), { aws: { signQuery: true, allHeaders: true } })).url;
  };
  return {
    /** The browser must send exactly these headers with its PUT. */
    async uploadUrl(key: string, contentType: string, seconds = 600) {
      const headers = { "Content-Type": contentType };
      return { url: await presign(objectUrl(key), "PUT", headers, seconds), headers };
    },
    async downloadUrl(key: string, fileName: string, { inline = true, seconds = 3600 } = {}) {
      const url = objectUrl(key);
      url.searchParams.set("response-content-disposition", disposition(fileName, inline));
      return presign(url, "GET", {}, seconds);
    },
    async exists(key: string) {
      const response = await aws.fetch(objectUrl(key), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`R2 HEAD failed with ${response.status}`);
      return true;
    },
    async remove(key: string) {
      const response = await aws.fetch(objectUrl(key), { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE failed with ${response.status}`);
    },
  };
}

export function r2() {
  shared ??= createClient();
  return shared;
}
