import { describe, expect, it } from "vitest";
import { prepareLogoFile } from "./prepareLogo";

describe("prepareLogoFile", () => {
  it("uploads logo files unchanged", async () => {
    const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    expect(await prepareLogoFile(svg)).toBe(svg);
  });

  it("labels files the picker left untyped from their extension", async () => {
    const pdf = await prepareLogoFile(new File(["%PDF"], "Brand Guide.PDF", { type: "" }));
    expect(pdf.type).toBe("application/pdf");
    expect(pdf.name).toBe("Brand Guide.PDF");
  });

  it("rejects files that are not images or documents we accept", async () => {
    await expect(prepareLogoFile(new File(["x"], "logo.ai", { type: "application/postscript" }))).rejects.toThrow("Logos must be");
  });
});
