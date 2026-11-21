import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFromHex(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("A 32-byte hexadecimal migration encryption key is required.");
  return Buffer.from(hex, "hex");
}
// Bind encrypted data to its purpose and identity; moving an envelope to a
// different request/source must fail authentication. Never reuse the backup key.
export function seal(value: string, keyHex: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromHex(keyHex), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function unseal(envelope: string, keyHex: string, context: string) {
  const [version, iv, tag, data, extra] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined || extra !== undefined) throw new Error("Invalid encrypted envelope.");
  const decipher = createDecipheriv("aes-256-gcm", keyFromHex(keyHex), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
