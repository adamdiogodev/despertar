import { describe, expect, it } from "vitest";
import { buildUploadPath, parseUploadReference, safeFileName } from "./upload-rules";

const uid = "11111111-2222-3333-4444-555555555555";

describe("parseUploadReference", () => {
  it("accepts a path inside the caller's folder", () => {
    expect(parseUploadReference(JSON.stringify({ path: `${uid}/a-laudo.pdf`, name: "laudo.pdf" }), uid)).toEqual({
      path: `${uid}/a-laudo.pdf`,
      name: "laudo.pdf",
    });
  });
  it("rejects another user's folder and traversal", () => {
    expect(parseUploadReference(JSON.stringify({ path: "someone-else/x.pdf", name: "x" }), uid)).toBeNull();
    expect(parseUploadReference(JSON.stringify({ path: `${uid}/../x.pdf`, name: "x" }), uid)).toBeNull();
  });
  it("rejects malformed values", () => {
    expect(parseUploadReference("not json", uid)).toBeNull();
    expect(parseUploadReference(null, uid)).toBeNull();
    expect(parseUploadReference(JSON.stringify({ path: 1 }), uid)).toBeNull();
  });
});

describe("buildUploadPath", () => {
  it("prefixes the user folder and sanitizes the name", () => {
    expect(buildUploadPath(uid, "Relatório Final (v2).pdf", "abc")).toBe(`${uid}/abc-Relatorio_Final_v2_.pdf`);
    expect(safeFileName("")).toBe("arquivo");
  });
});
