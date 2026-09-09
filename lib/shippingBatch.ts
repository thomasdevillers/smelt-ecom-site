import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

export interface Shipment { email: string; trackingNumber: string; name?: string }

export function parseShipments(value: unknown): Shipment[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Expected a non-empty JSON array of shipments.");
  const emails = new Set<string>();
  const tracking = new Set<string>();
  return value.map((row, index) => {
    if (!row || typeof row.email !== "string" || typeof row.trackingNumber !== "string") {
      throw new Error(`Shipment ${index + 1}: email and trackingNumber must be strings.`);
    }
    const email = row.email.trim();
    const trackingNumber = row.trackingNumber.trim();
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) || !/^\d+$/.test(trackingNumber)) {
      throw new Error(`Shipment ${index + 1}: invalid email or Aramex tracking number.`);
    }
    if (row.name !== undefined && typeof row.name !== "string") throw new Error(`Shipment ${index + 1}: name must be a string.`);
    if (emails.has(email.toLowerCase()) || tracking.has(trackingNumber)) throw new Error(`Shipment ${index + 1}: duplicate email or tracking number in batch.`);
    emails.add(email.toLowerCase());
    tracking.add(trackingNumber);
    return { email, trackingNumber, ...(row.name ? { name: row.name.trim() } : {}) };
  });
}

/** Persist an attempt BEFORE contacting Resend; ambiguous outcomes require manual reconciliation. */
export async function sendShipmentOnce(
  shipment: Shipment,
  receiptDir: string,
  send: (idempotencyKey: string) => Promise<string>,
): Promise<{ status: "accepted" | "skipped"; id: string }> {
  await mkdir(receiptDir, { recursive: true, mode: 0o700 });
  const key = `shipping-${createHash("sha256").update(`${shipment.email.toLowerCase()}\n${shipment.trackingNumber}`).digest("hex")}`;
  const receiptPath = join(receiptDir, `${key}.json`);
  try {
    await writeFile(receiptPath, JSON.stringify({ status: "pending", attemptedAt: new Date().toISOString(), ...shipment }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    if (receipt.status === "accepted" && typeof receipt.id === "string" && receipt.id) return { status: "skipped", id: receipt.id };
    throw new Error(`An unresolved send attempt exists for ${shipment.email}. Check Resend before retrying; receipt: ${receiptPath}`);
  }
  const id = await send(key);
  if (!id) throw new Error("Resend did not return an email ID. Reconcile the pending receipt before retrying.");
  const tempPath = `${receiptPath}.tmp`;
  await writeFile(tempPath, JSON.stringify({ status: "accepted", acceptedAt: new Date().toISOString(), id, ...shipment }, null, 2), { mode: 0o600 });
  await rename(tempPath, receiptPath);
  return { status: "accepted", id };
}
