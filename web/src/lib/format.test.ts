import { describe, expect, it } from "vitest";
import { ageFrom, durationMinutes, formatCents, initials, parseMoneyToCents, zonedToIso } from "./format";

describe("parseMoneyToCents", () => {
  it("parses pt-BR formatted values", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 120,50")).toBe(12050);
    expect(parseMoneyToCents("120")).toBe(12000);
  });
  it("accepts dot as decimal separator when there is no comma", () => {
    expect(parseMoneyToCents("99.90")).toBe(9990);
  });
  it("returns null for empty or invalid input", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats BRL", () => {
    expect(formatCents(12050).replace(/\s/g, " ")).toBe("R$ 120,50");
    expect(formatCents(null)).toBe("—");
  });
});

describe("dates", () => {
  it("converts São Paulo wall time to UTC", () => {
    expect(zonedToIso("2026-10-12", "09:30")).toBe("2026-10-12T12:30:00.000Z");
  });
  it("computes duration in minutes", () => {
    expect(durationMinutes("2026-10-12T12:00:00Z", "2026-10-12T12:45:00Z")).toBe(45);
  });
  it("computes age respecting birthday", () => {
    expect(ageFrom("2018-10-11", new Date("2026-10-10T12:00:00Z"))).toBe(7);
    expect(ageFrom("2018-10-10", new Date("2026-10-10T12:00:00Z"))).toBe(8);
  });
  it("builds initials", () => {
    expect(initials("Ana Paula Souza")).toBe("AP");
  });
});
