import { reviewNamespace, type ReviewNamespace } from "../lib/reviewNamespace";

export function reviewRankingOptions(args: string[]): { mode: ReviewNamespace; score: boolean; check: boolean } {
  const known = new Set(["--live", "--test", "--score", "--check"]);
  if (args.some(arg => !known.has(arg))) throw new Error("Use --live or --test, with optional --score or --check.");
  if (args.includes("--live") && args.includes("--test")) throw new Error("Choose either --live or --test, not both.");
  if (args.includes("--score") && args.includes("--check")) throw new Error("Use --check to inspect configuration or --score to score reviews, not both.");
  return {
    mode: args.includes("--live") ? "live" : args.includes("--test") ? "test" : reviewNamespace(),
    score: args.includes("--score"), check: args.includes("--check"),
  };
}

export function reviewRankingCredentialIssues(hasPhotos: boolean): string[] {
  const issues: string[] = [];
  if (!process.env.OPENAI_API_KEY) issues.push("OPENAI_API_KEY is missing.");
  if (hasPhotos && !process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    issues.push("Review images require BLOB_READ_WRITE_TOKEN, or both BLOB_STORE_ID and VERCEL_OIDC_TOKEN. An OIDC token alone is not sufficient.");
  }
  return issues;
}
