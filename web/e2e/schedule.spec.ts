import { expect, test, type Page } from "@playwright/test";
import { USERS, addDaysKey, login, nextWeekMonday } from "./helpers";

// Wednesday of next week, 16:00 in Sala 1 — free in the seed.
const date = addDaysKey(nextWeekMonday(), 2);

async function fillNewAppointment(page: Page) {
  await page.getByRole("button", { name: "+ Novo agendamento" }).click();
  const dialog = page.getByRole("dialog");
  // Field labels wrap the control and its hint, so label text is ambiguous here; use the field names.
  await dialog.locator('[name="patient_id"]').selectOption({ label: "Lucas Silva" });
  await dialog.locator('[name="assignment"]').selectOption({ label: "Ana Paula Souza — Psicologia" });
  await dialog.locator('[name="date"]').fill(date);
  await dialog.locator('[name="time"]').fill("16:00");
  await dialog.locator('[name="room_id"]').selectOption({ label: "Sala 1" });
  await dialog.getByRole("button", { name: "Agendar" }).click();
  return dialog;
}

test("recepção agenda sessão e o conflito de horário é recusado em pt-BR", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto(`/schedule?week=${nextWeekMonday()}`);

  const dialog = await fillNewAppointment(page);
  await expect(dialog.getByRole("status")).toHaveText("Sessão agendada.");
  await dialog.getByRole("button", { name: "Fechar" }).click();

  const block = page.getByTestId("schedule-block").filter({ hasText: "Lucas Silva" }).filter({ hasText: "16:00" });
  await expect(block).toHaveCount(1);
  await expect(block).toContainText("Psicologia");

  const conflict = await fillNewAppointment(page);
  await expect(conflict.getByRole("alert")).toHaveText("0 de 1 sessões agendadas.");
  await expect(conflict.getByTestId("recurrence-results")).toContainText(/já tem uma sessão neste horário|sala já está ocupada neste horário/);
  await conflict.getByRole("button", { name: "Fechar" }).click();
  await page.reload();
  await expect(block).toHaveCount(1);
});
