import { describe, expect, it } from "vitest";
import { passwordProblems } from "./password-rules";

describe("passwordProblems", () => {
  it("accepts a password meeting every rule", () => {
    expect(passwordProblems("Despertar2026")).toEqual([]);
    expect(passwordProblems("Despertar@2026")).toEqual([]);
  });

  it("requires at least 10 characters", () => {
    expect(passwordProblems("Abc12345")).toEqual(["Use pelo menos 10 caracteres."]);
  });

  it("requires upper, lower and digit", () => {
    expect(passwordProblems("despertar2026")).toEqual(["Inclua uma letra maiúscula."]);
    expect(passwordProblems("DESPERTAR2026")).toEqual(["Inclua uma letra minúscula."]);
    expect(passwordProblems("DespertarClinica")).toEqual(["Inclua um número."]);
  });

  it("lists every problem at once", () => {
    expect(passwordProblems("")).toHaveLength(4);
  });
});
