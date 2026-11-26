import { AdminError, adminJson } from "../admin/store";

/** Error response for the customer-facing custom hat routes. */
export function customHatFailure(error: unknown) {
  if (error instanceof AdminError) return adminJson({ error: error.message }, error.status);
  console.error("Custom hat request failed", error instanceof Error ? error.name : "Unknown error");
  return adminJson(
    {
      error:
        "Something went wrong on our side. Your designs are still on this page, so please try again in a moment.",
    },
    503,
  );
}
