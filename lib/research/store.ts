import "server-only";
import { postgresStore } from "../db/client";
import { researchRepository } from "./repository";
export function researchStore() {
  return researchRepository(
    postgresStore().db,
    process.env.NODE_ENV === "production" ? "production" : "development",
  );
}
