import "server-only";
import { sharedRedis } from "./sharedRedis";

// New operational-only entry point. The mixed legacy adminStore stays intact
// until each domain is explicitly cut over; do not redirect it to PostgreSQL.
export function operationalRedis() {
  return sharedRedis();
}
