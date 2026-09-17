// Aramex barcodes scan as the waybill number, but some labels wrap it in a prefix or separators.
// Mirrors the 6–30 digit rule sendShipping enforces, so a scan can never fill in a value the send would reject.
const WAYBILL = /^\d{6,30}$/;
export function readWaybill(text: string): string | null {
  const raw = text.trim();
  if (WAYBILL.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  return WAYBILL.test(digits) ? digits : null;
}
