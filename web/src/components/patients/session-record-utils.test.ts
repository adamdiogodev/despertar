import { describe, expect, it } from "vitest";
import { attachmentKind, canRegisterSession, familyConfirmationMeta, fileHref } from "./session-record-utils";

describe("familyConfirmationMeta", () => {
  it("is empty for sessions that are not completed", () => {
    expect(familyConfirmationMeta("scheduled", null, null)).toBeNull();
    expect(familyConfirmationMeta("canceled", "confirmed", null)).toBeNull();
  });
  it("labels each answer", () => {
    expect(familyConfirmationMeta("completed", null, null)).toEqual({ label: "Aguardando de acordo", tone: "yellow" });
    expect(familyConfirmationMeta("completed", "confirmed", null)).toEqual({ label: "Confirmada pela família", tone: "green" });
    expect(familyConfirmationMeta("completed", "disputed", "Não fomos")).toEqual({ label: "Contestada: Não fomos", tone: "red" });
  });
  it("shows a dispute the clinic resolved by keeping the session", () => {
    expect(familyConfirmationMeta("completed", "resolved", "Não fomos")).toEqual({ label: "Contestação resolvida pela clínica", tone: "green" });
  });
});

describe("attachmentKind", () => {
  it("renders browser images inline and links the rest", () => {
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("image/heic")).toBe("file");
    expect(attachmentKind("video/quicktime")).toBe("video");
    expect(attachmentKind("application/pdf")).toBe("pdf");
    expect(attachmentKind(null)).toBe("file");
  });
});

describe("fileHref", () => {
  it("encodes the storage path", () => {
    expect(fileHref("u/a b.jpg")).toBe("/files?path=u%2Fa%20b.jpg");
    expect(fileHref("u/x.pdf", true)).toBe("/files?path=u%2Fx.pdf&download=1");
  });
});


describe("canRegisterSession", () => {
  const now = new Date("2026-10-10T15:00:00Z");
  const base = { therapistId: "t1", status: "confirmed", startsAt: "2026-10-10T14:00:00Z", hasRecord: false };
  it("allows the own therapist once the session started", () => {
    expect(canRegisterSession(base, "t1", now)).toBe(true);
    expect(canRegisterSession({ ...base, status: "completed" }, "t1", now)).toBe(true);
  });
  it("refuses other therapists, future, canceled or already recorded sessions", () => {
    expect(canRegisterSession(base, "t2", now)).toBe(false);
    expect(canRegisterSession({ ...base, startsAt: "2026-10-10T16:00:00Z" }, "t1", now)).toBe(false);
    expect(canRegisterSession({ ...base, status: "canceled" }, "t1", now)).toBe(false);
    expect(canRegisterSession({ ...base, hasRecord: true }, "t1", now)).toBe(false);
  });
});
