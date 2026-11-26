import { parsePreorder } from "./inventory/preorders";

export function orderProjection(data: Record<string, unknown>) {
  let metadata = data.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  const c =
    data.customer && typeof data.customer === "object"
      ? (data.customer as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const customerEmail = str(c.email).toLowerCase();
  const customerName =
    str(m.customerName) || [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ");
  return {
    customerEmail,
    customerName,
    searchText: [str(data.reference), customerEmail, customerName].join("\n").toLowerCase(),
    preorder: parsePreorder(m.preorder) ?? null,
  };
}
