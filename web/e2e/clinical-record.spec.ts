import { expect, test } from "@playwright/test";
import { LUCAS_ID, USERS, login, loginAs } from "./helpers";

test("Ana registra evolução e publica orientação que chega ao portal da Carla", async ({ page, browser }) => {
  const stamp = Date.now();
  const noteText = `Evolução E2E ${stamp}: boa regulação emocional.`;
  const guidanceText = `Orientação E2E ${stamp}: ler uma história antes de dormir.`;

  await login(page, USERS.ana);
  await page.goto(`/patients/${LUCAS_ID}`);
  await page.getByRole("link", { name: "Prontuário" }).click();
  await expect(page.getByText("Prontuário sigiloso")).toBeVisible();

  const noteForm = page.getByTestId("new-note-form");
  await noteForm.getByLabel("Evolução *").fill(noteText);
  await noteForm.getByRole("button", { name: "Registrar evolução" }).click();
  await expect(page.getByTestId("session-note").filter({ hasText: noteText })).toBeVisible();

  await page.getByRole("link", { name: "Plano de atendimento" }).click();
  const planForm = page.getByTestId("treatment-plan-form");
  await planForm.getByLabel("Orientações em casa").fill(guidanceText);
  await planForm.getByTestId("plan-publish").click();
  await expect(planForm.getByRole("status")).toBeVisible();
  await expect(page.getByText("Publicado").first()).toBeVisible();

  const carla = await loginAs(browser, USERS.carla);
  await carla.page.goto("/portal");
  await expect(carla.page.getByText(guidanceText)).toBeVisible();
  await carla.context.close();
});
