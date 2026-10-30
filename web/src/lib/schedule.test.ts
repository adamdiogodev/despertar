import { describe, expect, it } from "vitest";
import {
  addDays,
  blockPosition,
  isDateKey,
  layoutLanes,
  localTimeKey,
  resolveWeek,
  weekDays,
  weekLabel,
  weekRange,
  weekStart,
  weekdayOf,
  weekdaysLabel,
  weeklyOccurrences,
} from "./schedule";

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekStart("2026-10-15")).toBe("2026-10-12"); // Thursday
    expect(weekStart("2026-10-17")).toBe("2026-10-12"); // Saturday
  });
  it("treats Sunday as the end of the week", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
  });
  it("crosses month and year boundaries", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
});

describe("resolveWeek", () => {
  it("normalizes a valid param to its Monday", () => {
    expect(resolveWeek("2026-10-14", "2026-01-01")).toBe("2026-10-12");
  });
  it("falls back to the current week on missing or invalid input", () => {
    expect(resolveWeek(undefined, "2026-10-10")).toBe("2026-10-05");
    expect(resolveWeek("2026-02-30", "2026-10-10")).toBe("2026-10-05");
    expect(resolveWeek("junk", "2026-10-10")).toBe("2026-10-05");
  });
});

describe("date helpers", () => {
  it("validates date keys", () => {
    expect(isDateKey("2026-10-12")).toBe(true);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey(42)).toBe(false);
  });
  it("adds days across months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-12", -7)).toBe("2026-10-05");
  });
  it("lists Monday to Saturday", () => {
    expect(weekDays("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  });
  it("builds the week range in São Paulo time", () => {
    expect(weekRange("2026-10-12")).toEqual({ from: "2026-10-12T03:00:00.000Z", to: "2026-10-18T03:00:00.000Z" });
  });
  it("labels the week", () => {
    expect(weekLabel("2026-12-28")).toBe("28 Dez — 02 Jan 2027");
  });
  it("formats local time", () => {
    expect(localTimeKey("2026-10-12T12:30:00Z")).toBe("09:30");
  });
});

describe("blockPosition", () => {
  it("positions by local start time and real duration", () => {
    // 09:00–09:50 São Paulo, 60px per hour, grid starts at 07:00
    expect(blockPosition("2026-10-12T12:00:00Z", "2026-10-12T12:50:00Z", 60)).toEqual({ top: 120, height: 50 });
  });
  it("clips sessions outside the visible hours and keeps a minimum height", () => {
    // 06:00–07:30 → starts at the top, 30 min visible
    expect(blockPosition("2026-10-12T09:00:00Z", "2026-10-12T10:30:00Z", 60)).toEqual({ top: 0, height: 30 });
    // 19:55–20:40 → 5 min visible, raised to the 15-min minimum
    expect(blockPosition("2026-10-12T22:55:00Z", "2026-10-12T23:40:00Z", 60)).toEqual({ top: 775, height: 15 });
  });
});

describe("layoutLanes", () => {
  it("keeps non-overlapping sessions in one lane", () => {
    const lanes = layoutLanes([
      { startsAt: "2026-10-12T12:00:00Z", endsAt: "2026-10-12T12:50:00Z" },
      { startsAt: "2026-10-12T13:00:00Z", endsAt: "2026-10-12T13:50:00Z" },
    ]);
    expect(lanes).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ]);
  });
  it("places overlapping sessions side by side and reuses free lanes", () => {
    const lanes = layoutLanes([
      { startsAt: "2026-10-12T12:00:00Z", endsAt: "2026-10-12T13:00:00Z" }, // A 09:00–10:00
      { startsAt: "2026-10-12T12:30:00Z", endsAt: "2026-10-12T13:30:00Z" }, // B 09:30–10:30
      { startsAt: "2026-10-12T13:00:00Z", endsAt: "2026-10-12T13:45:00Z" }, // C 10:00–10:45 (A's lane is free)
      { startsAt: "2026-10-12T15:00:00Z", endsAt: "2026-10-12T15:50:00Z" }, // D alone
    ]);
    expect(lanes).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
      { lane: 0, lanes: 2 },
      { lane: 0, lanes: 1 },
    ]);
  });
});

describe("weeklyOccurrences", () => {
  it("creates N weekly sessions at the same São Paulo time", () => {
    expect(weeklyOccurrences("2026-10-26", "14:00", 50, 3)).toEqual([
      { date: "2026-10-26", startsAt: "2026-10-26T17:00:00.000Z", endsAt: "2026-10-26T17:50:00.000Z" },
      { date: "2026-11-02", startsAt: "2026-11-02T17:00:00.000Z", endsAt: "2026-11-02T17:50:00.000Z" },
      { date: "2026-11-09", startsAt: "2026-11-09T17:00:00.000Z", endsAt: "2026-11-09T17:50:00.000Z" },
    ]);
  });
  it("returns a single occurrence when not recurring", () => {
    expect(weeklyOccurrences("2026-10-26", "08:00", 50, 0)).toHaveLength(1);
  });
});

describe("weekdayOf", () => {
  it("uses 0 = Sunday like Postgres extract(dow)", () => {
    expect(weekdayOf("2026-10-25")).toBe(0); // Sunday
    expect(weekdayOf("2026-10-27")).toBe(2); // Tuesday
    expect(weekdayOf("2026-10-31")).toBe(6); // Saturday
  });
});

describe("weekdaysLabel", () => {
  it("sorts, deduplicates and abbreviates", () => {
    expect(weekdaysLabel([4, 2, 2])).toBe("ter, qui");
    expect(weekdaysLabel([6, 0, 1])).toBe("dom, seg, sáb");
  });

  it("is empty without days", () => {
    expect(weekdaysLabel([])).toBe("");
  });
});
