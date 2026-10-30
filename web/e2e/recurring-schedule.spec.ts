import { expect, test } from "@playwright/test";
import { LUCAS_ID, USERS, addDaysKey, login, nextWeekMonday } from "./helpers";

// Tuesday of next week; 18:30 is free for Ana in the seed.
const tuesday = addDaysKey(nextWeekMonday(), 1);

test("recepção cria agenda fixa terça e quinta pela ficha do paciente e depois encerra", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto(`/patients/${LUCAS_ID}`);

  await page.getByRole("button", { name: "+ Agendar sessão" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[name="patient_id"]')).toHaveValue(LUCAS_ID);
  await dialog.locator('[name="assignment"]').selectOption({ label: "Ana Paula Souza — Psicologia" });
  await dialog.getByLabel("Agenda fixa (toda semana)").check();
  await dialog.locator('[name="date"]').fill(tuesday);
  await dialog.locator('[name="time"]').fill("18:30");
  const weekdays = dialog.getByTestId("recurring-weekdays");
  await expect(weekdays.getByLabel("ter")).toBeChecked();
  await weekdays.getByLabel("qui").check();
  await dialog.getByRole("button", { name: "Agendar" }).click();
  await expect(dialog.getByRole("status")).toContainText("Agenda fixa criada");
  await dialog.getByRole("button", { name: "Fechar" }).click();

  await page.goto(`/patients/${LUCAS_ID}?tab=sessions`);
  const rule = page.getByTestId("recurring-schedule-row").filter({ hasText: "ter, qui às 18:30" });
  await expect(rule).toContainText("Ativa");
  await expect(page.getByText(/18:30/).first()).toBeVisible();

  await rule.getByRole("button", { name: "Encerrar" }).click();
  const endDialog = page.getByRole("dialog");
  await endDialog.locator('[name="ends_on"]').fill(tuesday);
  await endDialog.getByRole("button", { name: "Encerrar agenda fixa" }).click();
  await expect(rule).toContainText("Até");
  await expect(rule.getByRole("button", { name: "Encerrar" })).toHaveCount(0);
});

test("lista de pacientes oferece agendar direto na linha", async ({ page }) => {
  await login(page, USERS.reception);
  await page.goto("/patients?q=Lucas");
  const row = page.getByTestId("patient-row").filter({ hasText: "Lucas Silva" });
  await row.getByRole("button", { name: "📅 Agendar" }).click();
  await expect(page.getByRole("dialog").locator('[name="patient_id"]')).toHaveValue(LUCAS_ID);
});
