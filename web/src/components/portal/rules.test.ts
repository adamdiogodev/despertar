import { describe, expect, it } from "vitest";
import { canRequestChange, chargeDisplayStatus, financeSituation, validatePassword, withChild } from "./rules";

describe("canRequestChange", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("allows a change when the session is further away than the minimum notice", () => {
    expect(canRequestChange(now, "2026-10-12T12:00:00Z", 24)).toBe(true);
  });

  it("allows a change exactly at the minimum notice", () => {
    expect(canRequestChange(now, new Date("2026-10-11T12:00:00Z"), 24)).toBe(true);
  });

  it("refuses a change inside the minimum notice", () => {
    expect(canRequestChange(now, "2026-10-11T11:59:00Z", 24)).toBe(false);
  });

  it("refuses a session that already started", () => {
    expect(canRequestChange(now, "2026-10-10T11:00:00Z", 0)).toBe(false);
  });

  it("respects a custom minimum", () => {
    expect(canRequestChange(now, "2026-10-12T11:00:00Z", 48)).toBe(false);
    expect(canRequestChange(now, "2026-10-10T13:00:00Z", 0)).toBe(true);
  });
});

describe("validatePassword", () => {
  it("accepts a strong password with matching confirmation", () => {
    expect(validatePassword("Despertar2026", "Despertar2026")).toBeNull();
  });

  it("requires at least 10 characters", () => {
    expect(validatePassword("Abc12345", "Abc12345")).toMatch(/10 caracteres/);
  });

  it("requires uppercase, lowercase and a digit", () => {
    expect(validatePassword("despertar2026", "despertar2026")).toMatch(/maiúscula/);
    expect(validatePassword("DESPERTAR2026", "DESPERTAR2026")).toMatch(/minúscula/);
    expect(validatePassword("DespertarAbc", "DespertarAbc")).toMatch(/número/);
  });

  it("requires the confirmation to match", () => {
    expect(validatePassword("Despertar2026", "Despertar2027")).toMatch(/confirmação/);
  });
});

describe("charges", () => {
  it("flags pending charges past due as overdue", () => {
    expect(chargeDisplayStatus("pending", "2026-10-01", "2026-10-10")).toBe("overdue");
    expect(chargeDisplayStatus("pending", "2026-10-10", "2026-10-10")).toBe("pending");
    expect(chargeDisplayStatus("paid", "2026-10-01", "2026-10-10")).toBe("paid");
  });

  it("summarises the family situation by the worst charge", () => {
    expect(financeSituation([], "2026-10-10")).toBe("up_to_date");
    expect(financeSituation([{ status: "paid", due_date: "2026-10-01" }], "2026-10-10")).toBe("up_to_date");
    expect(financeSituation([{ status: "pending", due_date: "2026-10-20" }], "2026-10-10")).toBe("pending");
    expect(
      financeSituation(
        [
          { status: "pending", due_date: "2026-10-20" },
          { status: "pending", due_date: "2026-10-01" },
        ],
        "2026-10-10",
      ),
    ).toBe("overdue");
  });
});

describe("withChild", () => {
  it("appends the child to links", () => {
    expect(withChild("/portal/sessions", "abc")).toBe("/portal/sessions?child=abc");
    expect(withChild("/portal/messages?c=1", "abc")).toBe("/portal/messages?c=1&child=abc");
    expect(withChild("/portal", null)).toBe("/portal");
  });
});
