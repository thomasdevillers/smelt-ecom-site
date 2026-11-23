import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLegacyPaystackEvent } from "./paystackLegacyEvent";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), failed: vi.fn(), meta: vi.fn(), inventory: vi.fn(), voucher: vi.fn(), log: vi.fn() }));
vi.mock("./orderConfirmation", () => ({ sendOrderNotifications: mocks.notify, logOrderConfirmationFailure: mocks.log }));
vi.mock("./email", () => ({ sendPaymentFailedEmail: mocks.failed }));
vi.mock("./metaConversions", () => ({ sendMetaPurchase: mocks.meta }));
vi.mock("./inventory", () => ({ commitInventory: mocks.inventory }));
vi.mock("./vouchers", async importOriginal => ({ ...await importOriginal<typeof import("./vouchers")>(), commitVoucher: mocks.voucher }));
const success = () => ({ event: "charge.success", data: { reference: "synthetic", amount: 54000, currency: "ZAR", paid_at: "2026-11-21T11:00:00Z",
  customer: { email: "synthetic@example.invalid" }, metadata: { cart: { green: 1, cream: 0 }, unitPrice: 450 } } });
beforeEach(() => { vi.resetAllMocks(); mocks.voucher.mockResolvedValue(true); mocks.inventory.mockResolvedValue(true); });
describe("preserved legacy payment processing", () => {
  it("keeps voucher, notification and conversion processing for valid successful payments", async () => {
    expect((await handleLegacyPaystackEvent(success())).status).toBe(200);
    expect(mocks.voucher).toHaveBeenCalledWith("synthetic", undefined);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ reference: "synthetic", amount: 54000 }));
    expect(mocks.meta).toHaveBeenCalledOnce();
  });
  it("retains inventory reservations as a prerequisite to vouchers and emails", async () => {
    const event = success(); event.data.reference = "smeltp-synthetic";
    mocks.inventory.mockResolvedValue(false);
    expect((await handleLegacyPaystackEvent(event)).status).toBe(503);
    expect(mocks.voucher).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("keeps voucher and mail failures retryable on the legacy route", async () => {
    mocks.voucher.mockResolvedValueOnce(false);
    expect((await handleLegacyPaystackEvent(success())).status).toBe(503); expect(mocks.notify).not.toHaveBeenCalled();
    mocks.notify.mockRejectedValue(new Error("unconfirmed"));
    expect((await handleLegacyPaystackEvent(success())).status).toBe(503);
    expect(mocks.log).toHaveBeenCalledOnce(); expect(mocks.meta).not.toHaveBeenCalled();
  });
  it("retains legacy failure emails", async () => {
    expect((await handleLegacyPaystackEvent({ ...success(), event: "charge.failed" })).status).toBe(200);
    expect(mocks.failed).toHaveBeenCalledOnce(); expect(mocks.notify).not.toHaveBeenCalled();
  });
});
