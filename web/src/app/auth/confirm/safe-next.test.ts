import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps relative paths with query string", () => {
    expect(safeNextPath("/auth/set-password")).toBe("/auth/set-password");
    expect(safeNextPath("/patients/1?tab=docs")).toBe("/patients/1?tab=docs");
  });

  it("falls back when next is missing", () => {
    expect(safeNextPath(null)).toBe("/auth/set-password");
    expect(safeNextPath("", "/")).toBe("/");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/\tevil",
    "evil.com/path",
    "/path\\..\\evil",
  ])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe("/auth/set-password");
  });
});
