import { describe, expect, it } from "vitest";
import { isAssignmentActive, isRecordStatus, likePattern, parsePage, patientsListHref } from "./patient-helpers";

describe("isAssignmentActive", () => {
  const today = "2026-10-10";
  it("is active when open-ended and already started", () => {
    expect(isAssignmentActive("2026-01-01", null, today)).toBe(true);
  });
  it("stays active through its end date", () => {
    expect(isAssignmentActive("2026-01-01", today, today)).toBe(true);
  });
  it("is inactive after the end date or before the start", () => {
    expect(isAssignmentActive("2026-01-01", "2026-10-09", today)).toBe(false);
    expect(isAssignmentActive("2026-10-11", null, today)).toBe(false);
  });
});

describe("patientsListHref", () => {
  it("keeps filters and drops empty values and page 1", () => {
    expect(patientsListHref({ q: "lu", therapy: "", status: "active", page: 1 })).toBe("/patients?q=lu&status=active");
  });
  it("applies overrides", () => {
    expect(patientsListHref({ q: "lu", page: 1 }, { page: 3 })).toBe("/patients?q=lu&page=3");
  });
  it("returns the bare path without filters", () => {
    expect(patientsListHref({})).toBe("/patients");
  });
});

describe("parsePage", () => {
  it("accepts positive integers only", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });
});

describe("isRecordStatus", () => {
  it("validates enum values", () => {
    expect(isRecordStatus("pending")).toBe(true);
    expect(isRecordStatus("deleted")).toBe(false);
  });
});

describe("likePattern", () => {
  it("escapes wildcards", () => {
    expect(likePattern("50%_a")).toBe("%50\\%\\_a%");
  });
});
