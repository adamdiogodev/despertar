import { expect, type Browser, type Page } from "@playwright/test";
import path from "node:path";

export const PASSWORD = "Despertar@2026";
export const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

export const USERS = {
  admin: "admin@despertar.local",
  coordination: "coordenacao@despertar.local",
  reception: "recepcao@despertar.local",
  ana: "ana@despertar.local",
  renata: "renata@despertar.local",
  carla: "carla@despertar.local",
} as const;

// Seed ids (supabase/seed.sql).
export const LUCAS_ID = "e01d520b-eb26-f8d0-d88e-d03c00605f57";
export const PEDRO_ID = "d7fab161-f7e5-dc2e-029f-e43de95b6d2f";

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar no Sistema" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function loginAs(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  return { context, page };
}

// yyyy-mm-dd in America/Sao_Paulo, `days` from today.
export function dateKeyFromToday(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}

// Monday (yyyy-mm-dd) of the week after the current one.
export function nextWeekMonday() {
  const today = dateKeyFromToday(0);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const daysToNextMonday = ((8 - weekday) % 7) || 7;
  return dateKeyFromToday(daysToNextMonday);
}

export function addDaysKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Notificações/ }).click();
}
