import { describe, expect, it } from "vitest";
import { buildCsv, centsToCsv, csvResponse } from "./csv";

describe("buildCsv", () => {
  it("starts with a UTF-8 BOM and separates with semicolons and CRLF", () => {
    const csv = buildCsv(["Família", "Valor"], [["Silva", "960,00"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe("Família;Valor\r\nSilva;960,00\r\n");
  });

  it("quotes cells with semicolons, quotes or line breaks", () => {
    const csv = buildCsv(["a"], [["x;y"], ['diz "oi"'], ["linha 1\nlinha 2"], ["r\rn"]]);
    expect(csv.slice(1).split("\r\n").slice(1, 4)).toEqual(['"x;y"', '"diz ""oi"""', '"linha 1\nlinha 2"']);
    expect(csv).toContain('"r\rn"');
  });

  it("does not quote decimal commas and renders null/undefined as empty", () => {
    const csv = buildCsv(["a", "b", "c", "d"], [["1.234,56", null, undefined, 42]]);
    expect(csv.slice(1)).toBe("a;b;c;d\r\n1.234,56;;;42\r\n");
  });
});

describe("centsToCsv", () => {
  it("formats cents with a decimal comma and no thousands separator", () => {
    expect(centsToCsv(123456)).toBe("1234,56");
    expect(centsToCsv(9000)).toBe("90,00");
    expect(centsToCsv(5)).toBe("0,05");
    expect(centsToCsv(-1050)).toBe("-10,50");
  });
  it("returns empty for missing values", () => {
    expect(centsToCsv(null)).toBe("");
    expect(centsToCsv(undefined)).toBe("");
  });
});

describe("csvResponse", () => {
  it("sends an attachment with a sanitized file name", async () => {
    const res = csvResponse("cobranças 2026-10.csv", buildCsv(["a"], []));
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cobran_as_2026-10.csv"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
});
