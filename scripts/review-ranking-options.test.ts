import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewRankingCredentialIssues, reviewRankingOptions } from "./review-ranking-options";

afterEach(() => vi.unstubAllEnvs());

describe("ranking command namespace selection", () => {
  it("selects live reviews without changing test payment credentials", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_unchanged");
    expect(reviewRankingOptions(["--live", "--score"])).toEqual({ mode: "live", score: true, check: false });
    expect(process.env.PAYSTACK_SECRET_KEY).toBe("sk_test_unchanged");
  });
  it("can select test reviews even with live payment credentials", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_unchanged");
    expect(reviewRankingOptions(["--test", "--check"])).toEqual({ mode: "test", score: false, check: true });
    expect(process.env.PAYSTACK_SECRET_KEY).toBe("sk_live_unchanged");
  });
  it("defaults to the existing payment-selected namespace", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect(reviewRankingOptions(["--score"]).mode).toBe("test");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
    expect(reviewRankingOptions([]).mode).toBe("live");
  });
  it.each([["--live", "--test"], ["--score", "--check"], ["--lvie"], ["--mode=live"]])("rejects conflicting or misspelled arguments %j", (...args) => {
    expect(() => reviewRankingOptions(args)).toThrow();
  });
});

describe("ranking command credential preflight", () => {
  function configure() {
    vi.stubEnv("OPENAI_API_KEY", "configured");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  }
  it("does not mistake an OIDC token alone for working Blob credentials", () => {
    configure();
    vi.stubEnv("VERCEL_OIDC_TOKEN", "configured");
    expect(reviewRankingCredentialIssues(true)).toHaveLength(1);
    vi.stubEnv("BLOB_STORE_ID", "configured");
    expect(reviewRankingCredentialIssues(true)).toEqual([]);
  });
  it("accepts a read-write token for local image scoring", () => {
    configure();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "configured");
    expect(reviewRankingCredentialIssues(true)).toEqual([]);
  });
  it("does not require Blob credentials for text-only reviews", () => {
    configure();
    expect(reviewRankingCredentialIssues(false)).toEqual([]);
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(reviewRankingCredentialIssues(false)).toEqual(["OPENAI_API_KEY is missing."]);
  });
});
