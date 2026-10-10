import { describe, expect, it } from "vitest";
import { formatBytes, isDocumentCategory } from "./document-utils";

describe("formatBytes", () => {
  it("formats bytes, KB and MB (pt-BR decimal)", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

describe("isDocumentCategory", () => {
  it("accepts only known categories", () => {
    expect(isDocumentCategory("contract")).toBe(true);
    expect(isDocumentCategory("toString")).toBe(false);
    expect(isDocumentCategory(undefined)).toBe(false);
  });
});
