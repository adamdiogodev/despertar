import { describe, expect, it } from "vitest";
import { buildCsv, deadlineState, filterReports, quarterStart, type ReportRow } from "./report-utils";

describe("buildCsv", () => {
  it("joins with semicolons, CRLF and a UTF-8 BOM", () => {
    expect(buildCsv(["a", "b"], [["1", 2]])).toBe("﻿a;b\r\n1;2\r\n");
  });

  it("quotes cells with quotes, semicolons and line breaks", () => {
    const csv = buildCsv(["x"], [['diz "oi"'], ["a;b"], ["linha1\nlinha2"]]);
    expect(csv).toBe('﻿x\r\n"diz ""oi"""\r\n"a;b"\r\n"linha1\nlinha2"\r\n');
  });

  it("renders null/undefined as empty and neutralises formulas", () => {
    expect(buildCsv(["a", "b", "c"], [[null, undefined, "=HYPERLINK(1)"]])).toBe("﻿a;b;c\r\n;;'=HYPERLINK(1)\r\n");
  });
});

describe("deadlineState", () => {
  const today = "2026-10-10";
  it("flags overdue and due within 3 days", () => {
    expect(deadlineState({ status: "pending", due_date: "2026-10-09" }, today)).toBe("overdue");
    expect(deadlineState({ status: "returned", due_date: "2026-10-13" }, today)).toBe("urgent");
    expect(deadlineState({ status: "pending", due_date: "2026-10-14" }, today)).toBeNull();
  });
  it("ignores reports already submitted or without due date", () => {
    expect(deadlineState({ status: "in_review", due_date: "2026-10-01" }, today)).toBeNull();
    expect(deadlineState({ status: "pending", due_date: null }, today)).toBeNull();
  });
});

describe("quarterStart", () => {
  it("returns the first day of the quarter", () => {
    expect(quarterStart("2026-10-10")).toBe("2026-10-01");
    expect(quarterStart("2026-06-30")).toBe("2026-04-01");
    expect(quarterStart("2026-01-01")).toBe("2026-01-01");
  });
});

describe("filterReports", () => {
  const base = { report_type: "other", reference_label: "", due_date: null, file_path: null, submitted_at: null, reviewed_at: null, return_reason: null, created_at: "", therapist: null, reviewer: null } as const;
  const rows: ReportRow[] = [
    { ...base, id: "1", status: "pending", therapist_id: "t1", patient: { full_name: "Lucas Silva" } },
    { ...base, id: "2", status: "approved", therapist_id: "t2", patient: { full_name: "Ana Lúcia" } },
  ];
  it("filters by status, therapist and case-insensitive patient name", () => {
    expect(filterReports(rows, { status: "pending" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterReports(rows, { therapistId: "t2" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterReports(rows, { q: "lucas" }).map((r) => r.id)).toEqual(["1"]);
  });
});
