import { getAvailability } from "./inventory/purchaseStore";
import type { Availability } from "./inventory/preorders";

export async function getProductAvailability(): Promise<Availability | null> {
  try {
    return await getAvailability();
  } catch {
    console.error("Product availability is temporarily unavailable.");
    return null;
  }
}
