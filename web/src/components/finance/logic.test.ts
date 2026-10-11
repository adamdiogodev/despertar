import { describe, expect, it } from "vitest";
import {
  chargeDisplayStatus,
  computeSessionAmount,
  familyBalances,
  paymentRange,
  payoutTotals,
  receiptFileError,
  requestTitle,
  groupPreview,
  monthBounds,
  rateOn,
  summarizeCharges,
  summarizeSessions,
} from "./logic";

describe("chargeDisplayStatus", () => {
  it("marks pending charges past due as overdue", () => {
    expect(chargeDisplayStatus("pending", "2026-10-09", "2026-10-10")).toBe("overdue");
    expect(chargeDisplayStatus("pending", "2026-10-10", "2026-10-10")).toBe("pending");
    expect(chargeDisplayStatus("paid", "2026-01-01", "2026-10-10")).toBe("paid");
    expect(chargeDisplayStatus("awaiting_insurance", "2026-01-01", "2026-10-10")).toBe("awaiting_insurance");
  });
});

describe("monthBounds", () => {
  it("returns the first and last day of the month", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
  it("rejects malformed months", () => {
    expect(monthBounds("2026-13")).toBeNull();
    expect(monthBounds("10/2026")).toBeNull();
    expect(monthBounds("")).toBeNull();
  });
});

describe("summarizeCharges", () => {
  const october = { start: "2026-10-01", end: "2026-10-31" };
  const charges = [
    { family_id: "a", amount_cents: 96000, due_date: "2026-10-15", status: "paid" as const },
    { family_id: "b", amount_cents: 48000, due_date: "2026-10-15", status: "pending" as const },
    { family_id: "c", amount_cents: 120000, due_date: "2026-10-20", status: "awaiting_insurance" as const },
    { family_id: "d", amount_cents: 48000, due_date: "2026-09-15", status: "pending" as const },
    { family_id: "d", amount_cents: 10000, due_date: "2026-10-05", status: "pending" as const },
    { family_id: "e", amount_cents: 99900, due_date: "2026-10-01", status: "canceled" as const },
  ];

  it("sums the month KPIs and counts delinquent families across months", () => {
    expect(summarizeCharges(charges, october, "2026-10-10")).toEqual({
      billedCents: 96000 + 48000 + 120000 + 10000,
      receivedCents: 96000,
      insuranceCents: 120000,
      overdueCents: 48000 + 10000,
      overdueFamilies: 1,
    });
  });
});

describe("computeSessionAmount", () => {
  it("pays the fixed amount per session regardless of length", () => {
    expect(computeSessionAmount("per_session", 12000, 75)).toBe(12000);
  });
  it("pays per hour proportionally to the real duration, rounded to the cent", () => {
    expect(computeSessionAmount("per_hour", 12000, 45)).toBe(9000);
    expect(computeSessionAmount("per_hour", 14000, 50)).toBe(11667);
    expect(computeSessionAmount("per_hour", 15000, 60)).toBe(15000);
  });
});

const rates = [
  { therapist_id: "t1", therapy_id: "psi", pay_model: "per_session" as const, amount_cents: 10000, valid_from: "2026-01-01" },
  { therapist_id: "t1", therapy_id: "psi", pay_model: "per_session" as const, amount_cents: 12000, valid_from: "2026-09-01" },
  { therapist_id: "t2", therapy_id: "fono", pay_model: "per_hour" as const, amount_cents: 14000, valid_from: "2026-01-01" },
];

describe("rateOn", () => {
  it("picks the latest rate valid on the date", () => {
    expect(rateOn(rates, "t1", "psi", "2026-08-31")?.amount_cents).toBe(10000);
    expect(rateOn(rates, "t1", "psi", "2026-09-01")?.amount_cents).toBe(12000);
  });
  it("returns null before any validity or for another therapy", () => {
    expect(rateOn(rates, "t1", "psi", "2025-12-31")).toBeNull();
    expect(rateOn(rates, "t1", "fono", "2026-10-01")).toBeNull();
  });
});

describe("summarizeSessions", () => {
  it("counts by status and estimates only completed sessions", () => {
    const rows = summarizeSessions(
      [
        { therapist_id: "t1", therapy_id: "psi", status: "completed", date: "2026-08-20", minutes: 50 },
        { therapist_id: "t1", therapy_id: "psi", status: "completed", date: "2026-09-10", minutes: 60 },
        { therapist_id: "t1", therapy_id: "psi", status: "no_show", date: "2026-09-17", minutes: 50 },
        { therapist_id: "t2", therapy_id: "fono", status: "completed", date: "2026-09-10", minutes: 45 },
        { therapist_id: "t2", therapy_id: "fono", status: "canceled", date: "2026-09-11", minutes: 45 },
        { therapist_id: "t3", therapy_id: "to", status: "completed", date: "2026-09-10", minutes: 60 },
      ],
      rates,
    );
    expect(rows).toEqual([
      { therapistId: "t1", therapyId: "psi", completed: 2, noShow: 1, canceled: 0, completedMinutes: 110, estimatedCents: 22000, missingRate: false },
      { therapistId: "t2", therapyId: "fono", completed: 1, noShow: 0, canceled: 1, completedMinutes: 45, estimatedCents: 10500, missingRate: false },
      { therapistId: "t3", therapyId: "to", completed: 1, noShow: 0, canceled: 0, completedMinutes: 60, estimatedCents: 0, missingRate: true },
    ]);
  });
});

describe("groupPreview", () => {
  it("groups by therapist × therapy and flags missing rates", () => {
    const groups = groupPreview([
      { therapist_id: "t2", therapy_id: "fono", minutes: 45, pay_model: "per_hour", rate_cents: 14000, amount_cents: 10500 },
      { therapist_id: "t2", therapy_id: "fono", minutes: 50, pay_model: "per_hour", rate_cents: 14000, amount_cents: 11667 },
      { therapist_id: "t3", therapy_id: "to", minutes: 60, pay_model: null, rate_cents: null, amount_cents: null },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ sessions: 2, minutes: 95, totalCents: 22167, missingRate: false, rules: [expect.stringMatching(/^R\$\s140,00\/hora$/)] });
    expect(groups[1]).toMatchObject({ therapistId: "t3", sessions: 1, totalCents: 0, missingRate: true, rules: [] });
  });
});


describe("receiptFileError", () => {
  it("requires a PDF or image", () => {
    expect(receiptFileError(null)).toBe("Anexe o comprovante.");
    expect(receiptFileError({ type: "application/pdf", size: 0 })).toBe("Anexe o comprovante.");
    expect(receiptFileError({ type: "video/mp4", size: 10 })).toMatch(/PDF ou imagem/);
    expect(receiptFileError({ type: "image/jpeg", size: 10 })).toBeNull();
    expect(receiptFileError({ type: "application/pdf", size: 10 })).toBeNull();
  });
});

describe("familyBalances", () => {
  it("splits paid, open and overdue per family, ignoring canceled", () => {
    const balances = familyBalances(
      [
        { family_id: "a", amount_cents: 1000, due_date: "2026-10-01", status: "paid" },
        { family_id: "a", amount_cents: 2000, due_date: "2026-10-01", status: "pending" },
        { family_id: "a", amount_cents: 3000, due_date: "2026-10-20", status: "pending" },
        { family_id: "a", amount_cents: 4000, due_date: "2026-09-01", status: "awaiting_insurance" },
        { family_id: "a", amount_cents: 9999, due_date: "2026-09-01", status: "canceled" },
        { family_id: "b", amount_cents: 500, due_date: "2026-10-01", status: "paid" },
      ],
      "2026-10-10",
    );
    expect(balances.get("a")).toEqual({ paidCents: 1000, openCents: 9000, overdueCents: 2000, count: 5 });
    expect(balances.get("b")).toEqual({ paidCents: 500, openCents: 0, overdueCents: 0, count: 1 });
  });
});

describe("payoutTotals", () => {
  it("sums payments in the range and in the year, and what is still open", () => {
    const totals = payoutTotals(
      [
        { therapist_id: "t", amount_cents: 100, status: "paid", paid_on: "2026-10-05" },
        { therapist_id: "t", amount_cents: 200, status: "paid", paid_on: "2026-03-05" },
        { therapist_id: "t", amount_cents: 400, status: "paid", paid_on: "2025-12-31" },
        { therapist_id: "t", amount_cents: 800, status: "approved", paid_on: null },
        { therapist_id: "t", amount_cents: 1600, status: "requested", paid_on: null },
      ],
      { start: "2026-10-01", end: "2026-10-31" },
      "2026",
    );
    expect(totals.get("t")).toEqual({ paidInRangeCents: 100, paidInYearCents: 300, openCents: 2400, count: 5 });
  });
});

describe("paymentRange", () => {
  it("covers a whole year or one month", () => {
    expect(paymentRange("2026", null)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
    expect(paymentRange("2026", "02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(paymentRange("26", null)).toBeNull();
    expect(paymentRange("2026", "13")).toBeNull();
  });
});

describe("requestTitle", () => {
  it("names session requests by therapy and period and manual ones by description", () => {
    expect(requestTitle({ description: null, therapy: { name: "Psicologia" }, period: { label: "Outubro" } })).toBe("Psicologia · Outubro");
    expect(requestTitle({ description: "Plantão sábado", therapy: null, period: null })).toBe("Plantão sábado");
  });
});
