import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseShipments, sendShipmentOnce } from "./shippingBatch";

const folders: string[] = [];
async function receiptDir() {
  const dir = await mkdtemp(join(tmpdir(), "smelt-shipping-test-"));
  folders.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const shipment = { email: "sam@example.com", trackingNumber: "0012345" };

describe("shipment validation", () => {
  it("preserves tracking strings and rejects invalid or duplicate batches", () => {
    expect(parseShipments([shipment])).toEqual([shipment]);
    expect(() => parseShipments([{ ...shipment, trackingNumber: 12345 }])).toThrow("strings");
    expect(() => parseShipments([shipment, { ...shipment, email: "SAM@example.com", trackingNumber: "678" }])).toThrow("duplicate");
    expect(() => parseShipments([shipment, { ...shipment, email: "other@example.com" }])).toThrow("duplicate");
    expect(() => parseShipments([{ ...shipment, email: "sam@example.com,other@example.com" }])).toThrow("invalid");
    expect(() => parseShipments([])).toThrow("non-empty");
  });
});

describe("shipping send receipts", () => {
  it("skips an accepted shipment on later runs", async () => {
    const dir = await receiptDir();
    const send = vi.fn().mockResolvedValue("resend-123");
    expect(await sendShipmentOnce(shipment, dir, send)).toEqual({ status: "accepted", id: "resend-123" });
    expect(await sendShipmentOnce(shipment, dir, send)).toEqual({ status: "skipped", id: "resend-123" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatch(/^shipping-[a-f0-9]{64}$/);
  });

  it("blocks retries when acceptance is uncertain", async () => {
    const dir = await receiptDir();
    const send = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(sendShipmentOnce(shipment, dir, send)).rejects.toThrow("timeout");
    await expect(sendShipmentOnce(shipment, dir, send)).rejects.toThrow("unresolved");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent attempt for a shipment", async () => {
    const dir = await receiptDir();
    let finish!: (id: string) => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const send = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; started(); }));
    const first = sendShipmentOnce(shipment, dir, send);
    await began;
    await expect(sendShipmentOnce(shipment, dir, send)).rejects.toThrow("unresolved");
    finish("resend-456");
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
