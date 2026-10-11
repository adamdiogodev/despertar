import { expect, test } from "@playwright/test";
import { USERS, login, loginAs } from "./helpers";

const MAILPIT = "http://127.0.0.1:54424/api/v1";

type MailSummary = { ID: string; To: { Address: string }[] };

async function inviteLink(email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/messages?limit=50`)).json()) as { messages: MailSummary[] };
    const message = list.messages.find((item) => item.To.some((to) => to.Address.toLowerCase() === email));
    if (message) {
      const detail = (await (await fetch(`${MAILPIT}/message/${message.ID}`)).json()) as { HTML: string };
      const href = detail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Invite e-mail for ${email} not found in Mailpit`);
}

test("admin convida terapeuta, que define a senha pelo link e faz login", async ({ browser }) => {
  const stamp = Date.now();
  const email = `e2e.therapist.${stamp}@despertar.local`;
  const password = `NovaSenha${stamp % 10000}A`;

  const admin = await loginAs(browser, USERS.admin);
  await admin.page.goto("/therapists");
  await admin.page.getByRole("button", { name: "+ Novo terapeuta" }).click();
  const form = admin.page.getByTestId("new-therapist-form");
  await form.getByLabel("Nome completo").fill(`Terapeuta E2E ${stamp}`);
  await form.getByLabel("E-mail (login)").fill(email);
  await form.getByLabel("Especialidade").fill("Psicóloga");
  await form.getByRole("button", { name: "Criar terapeuta" }).click();
  await expect(admin.page).toHaveURL(/\/therapists\/[0-9a-f-]{36}\?created=1/);
  await admin.context.close();

  const link = await inviteLink(email);
  const invited = await browser.newContext();
  const page = await invited.newPage();
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/set-password/);
  await page.getByTestId("new-password").fill(password);
  await page.getByTestId("confirm-password").fill(password);
  await page.getByRole("button", { name: "Salvar senha e entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await invited.close();

  const fresh = await browser.newContext();
  const loginPage = await fresh.newPage();
  await login(loginPage, email, password);
  await expect(loginPage).toHaveURL(/\/dashboard$/);
  await fresh.close();
});
