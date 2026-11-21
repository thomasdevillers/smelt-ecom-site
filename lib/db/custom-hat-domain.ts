import { and, eq, gt, isNull, or } from "drizzle-orm";
import { AdminError, digest } from "../admin/store";
import type { ReviewNamespace } from "../reviewNamespace";
import { CUSTOM_HAT_MAX_UPLOADS, fileKeysOf, type CustomHatSubmission } from "../customHats/shared";
import type { StoredRequest } from "../customHats/store";
import type { DomainDatabase } from "./review-domain";
import * as s from "./schema";

export function customHatDomain(db: DomainDatabase, environment: ReviewNamespace) {
  const requestWhere = (id: string) => and(eq(s.customRequests.environment, environment), eq(s.customRequests.id, id));
  const filesWhere = (id: string) => and(eq(s.customFiles.environment, environment), eq(s.customFiles.requestId, id));
  const validFile = () => or(isNull(s.customFiles.expiresAt), gt(s.customFiles.expiresAt, new Date().toISOString()));
  function active(row: typeof s.customRequests.$inferSelect) {
    return !row.expiresAt || Date.parse(row.expiresAt) > Date.now();
  }
  async function materialise(database: DomainDatabase, row: typeof s.customRequests.$inferSelect): Promise<StoredRequest> {
    if (!row.token) throw new AdminError("This design link needs manual reconciliation.", 503);
    const [revision] = row.revision ? await database.select().from(s.customRevisions).where(and(eq(s.customRevisions.environment, environment), eq(s.customRevisions.requestId, row.id), eq(s.customRevisions.revision, row.revision))) : [];
    if (row.revision && !revision) throw new AdminError("This design revision needs manual reconciliation.", 503);
    return { id: row.id, token: row.token, customer: row.customer as StoredRequest["customer"], createdAt: new Date(row.createdAt).toISOString(),
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : null, revision: row.revision, submission: revision?.submission ?? null };
  }
  async function locked(database: DomainDatabase, id: string) {
    const [row] = await database.select().from(s.customRequests).where(requestWhere(id)).for("update");
    if (!row || !active(row)) throw new AdminError("This design link is no longer valid.", 404);
    return row;
  }
  return {
    async create(request: StoredRequest) {
      await db.transaction(async tx => {
        await tx.insert(s.environments).values({ id: environment, paymentMode: environment }).onConflictDoNothing();
        const [namespace] = await tx.select().from(s.environments).where(eq(s.environments.id, environment));
        if (namespace?.paymentMode !== environment) throw new AdminError("Design environment ownership needs reconciliation.", 503);
        await tx.insert(s.customRequests).values({ environment, id: request.id, tokenDigest: digest(request.token), token: request.token, customer: request.customer, createdAt: request.createdAt, revision: 0 });
      });
    },
    async find(id: string) {
      const [row] = await db.select().from(s.customRequests).where(requestWhere(id));
      return row ? materialise(db, row) : null;
    },
    async forToken(token: string) {
      const [row] = await db.select().from(s.customRequests).where(and(eq(s.customRequests.environment, environment), eq(s.customRequests.tokenDigest, digest(token))));
      return row && active(row) ? materialise(db, row) : null;
    },
    async list() {
      // Read the current revision with its request in one snapshot.
      return db.transaction(async tx => {
        const rows = await tx.select().from(s.customRequests).where(eq(s.customRequests.environment, environment));
        const requests: StoredRequest[] = [];
        for (const row of rows) requests.push(await materialise(tx, row));
        return requests;
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async files(id: string) {
      const rows = await db.select().from(s.customFiles).where(and(filesWhere(id), validFile()));
      return rows.map(row => row.fileKey);
    },
    async reserve(id: string, fileKey: string) {
      await db.transaction(async tx => {
        await locked(tx, id);
        if (!fileKey.startsWith(`custom-hats/${environment}/${id}/`)) throw new AdminError("Invalid artwork file.");
        const rows = await tx.select().from(s.customFiles).where(and(filesWhere(id), validFile()));
        if (rows.length >= CUSTOM_HAT_MAX_UPLOADS) throw new AdminError("Upload limit reached for this link. Send any remaining files to us directly.", 429);
        await tx.insert(s.customFiles).values({ environment, requestId: id, fileKey });
      });
    },
    async submit(id: string, expectedRevision: number, submission: CustomHatSubmission) {
      return db.transaction(async tx => {
        const row = await locked(tx, id);
        if (row.revision !== expectedRevision) throw new AdminError("This design was updated while you were submitting. Refresh and try again.", 409);
        const files = await tx.select().from(s.customFiles).where(and(filesWhere(id), validFile()));
        const owned = new Set(files.map(file => file.fileKey));
        if (fileKeysOf(submission).some(key => !owned.has(key))) throw new AdminError("A logo does not belong to this design link.");
        const revision = row.revision + 1, submittedAt = new Date().toISOString();
        await tx.insert(s.customRevisions).values({ environment, requestId: id, revision, submission, submittedAt });
        await tx.update(s.customRequests).set({ revision, submittedAt }).where(requestWhere(id));
        return { ...await materialise(tx, { ...row, revision, submittedAt }), submission };
      });
    },
    async remove(id: string, removeFiles: (keys: string[]) => Promise<void>) {
      await db.transaction(async tx => {
        const [row] = await tx.select().from(s.customRequests).where(requestWhere(id)).for("update");
        if (!row) return;
        // Include expired and unsubmitted ownership, just like the Redis set.
        const files = await tx.select().from(s.customFiles).where(filesWhere(id));
        await removeFiles(files.map(file => file.fileKey));
        await tx.delete(s.customFiles).where(filesWhere(id));
        await tx.delete(s.customRevisions).where(and(eq(s.customRevisions.environment, environment), eq(s.customRevisions.requestId, id)));
        await tx.delete(s.customRequests).where(requestWhere(id));
      });
    },
  };
}
