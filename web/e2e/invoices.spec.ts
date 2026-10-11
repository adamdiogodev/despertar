import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_PDF, USERS, loginAs, openBell } from "./helpers";

async function openSeedPeriod(page: Page) {
  await page.goto("/finance/invoices");
  await page.getByRole("link", { name: /Período de teste/ }).click();
  await expect(page).toHaveURL(/\/finance\/invoices\/[0-9a-f-]{36}$/);
}

test("NF: admin gera, Ana envia, admin aprova e paga, Ana vê paga e é notificada", async ({ browser }) => {
  const invoiceNumber = `2026/E2E${Date.now() % 100000}`;

  const admin = await loginAs(browser, USERS.admin);
  admin.page.on("dialog", (dialog) => dialog.accept());
  await openSeedPeriod(admin.page);
  await expect(admin.page.getByTestId("preview-row").filter({ hasText: "Ana Paula Souza" })).toBeVisible();
  await admin.page.getByTestId("generate-invoices").click();
  await expect(admin.page.getByTestId("generate-result")).toBeVisible();
  const adminRow = admin.page.getByTestId("invoice-request-row").filter({ hasText: "Ana Paula Souza" });
  await expect(adminRow).toContainText("Aguardando NF");
  const amount = (await adminRow.locator("td").nth(4).innerText()).trim();

  const ana = await loginAs(browser, USERS.ana);
  await ana.page.goto("/invoices");
  const card = ana.page.getByTestId("my-invoice").filter({ hasText: "Aguardando NF" }).first();
  await expect(card).toContainText(amount);
  await card.getByRole("button", { name: "Enviar NF" }).click();
  const dialog = ana.page.getByRole("dialog");
  await dialog.getByLabel("Número da NF").fill(invoiceNumber);
  await dialog.getByLabel(/Arquivo/).setInputFiles(SAMPLE_PDF);
  await dialog.getByTestId("submit-invoice-submit").click();
  await expect(dialog).toBeHidden();
  await expect(ana.page.getByTestId("my-invoice").filter({ hasText: invoiceNumber })).toContainText("NF enviada");

  await openSeedPeriod(admin.page);
  await expect(adminRow).toContainText(invoiceNumber);
  await adminRow.getByTestId("approve-invoice").click();
  await expect(adminRow).toContainText("Aprovada");
  await adminRow.getByTestId("pay-invoice").click();
  await expect(adminRow).toContainText("Paga");

  await ana.page.goto("/invoices");
  await expect(ana.page.getByTestId("my-invoice").filter({ hasText: invoiceNumber })).toContainText("Paga");
  await openBell(ana.page);
  await expect(ana.page.getByRole("link", { name: /Repasse realizado/ })).toBeVisible();

  await Promise.all([admin.context.close(), ana.context.close()]);
});
