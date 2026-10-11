import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_PDF, USERS, loginAs } from "./helpers";

function row(page: Page, reference: string) {
  return page.getByTestId("report-row").filter({ hasText: reference });
}

async function submitAsTherapist(page: Page, reference: string, tab: "pending" | "returned") {
  await page.goto(`/reports?tab=${tab}`);
  await row(page, reference).getByRole("button", { name: "📤 Enviar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo do relatório").setInputFiles(SAMPLE_PDF);
  await dialog.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/reports?tab=in_review");
  await expect(row(page, reference)).toContainText("Lucas Silva");
}

test("relatório: solicitação, envio, devolução, reenvio, aprovação e portal", async ({ browser }) => {
  const reference = `E2E ${Date.now()}`;
  const returnReason = "Faltou a seção de objetivos do semestre.";

  const coord = await loginAs(browser, USERS.coordination);
  await coord.page.goto("/reports");
  await coord.page.getByRole("button", { name: "+ Solicitar relatório" }).click();
  const create = coord.page.getByRole("dialog");
  await create.getByLabel("Paciente").selectOption({ label: "Lucas Silva" });
  await create.getByLabel("Terapeuta").selectOption({ label: "Ana Paula Souza" });
  await create.getByLabel("Tipo").selectOption({ index: 1 });
  await create.getByLabel("Referência").fill(reference);
  await create.getByRole("button", { name: "Solicitar" }).click();
  await expect(create).toBeHidden();
  await expect(row(coord.page, reference)).toBeVisible();

  const ana = await loginAs(browser, USERS.ana);
  await submitAsTherapist(ana.page, reference, "pending");

  await coord.page.goto("/reports?tab=in_review");
  await row(coord.page, reference).getByRole("button", { name: "↩ Devolver" }).click();
  const back = coord.page.getByRole("dialog");
  await back.getByLabel("Motivo da devolução").fill(returnReason);
  await back.getByRole("button", { name: "Devolver", exact: true }).click();
  await expect(back).toBeHidden();

  await ana.page.goto("/reports?tab=returned");
  await expect(row(ana.page, reference)).toContainText(returnReason);
  await submitAsTherapist(ana.page, reference, "returned");

  await coord.page.goto("/reports?tab=in_review");
  await row(coord.page, reference).getByTestId("report-approve").click();
  await expect(row(coord.page, reference)).toHaveCount(0);
  await coord.page.goto("/reports?tab=approved");
  await expect(row(coord.page, reference)).toBeVisible();

  const carla = await loginAs(browser, USERS.carla);
  await carla.page.goto("/portal/documents");
  await expect(carla.page.getByText(reference)).toBeVisible();

  await Promise.all([coord.context.close(), ana.context.close(), carla.context.close()]);
});
