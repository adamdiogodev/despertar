import { expect, test } from "@playwright/test";
import { LUCAS_ID, PEDRO_ID, USERS, login } from "./helpers";

test.describe("Acesso por perfil", () => {
  for (const [email, home] of [
    [USERS.admin, "/dashboard"],
    [USERS.coordination, "/dashboard"],
    [USERS.reception, "/dashboard"],
    [USERS.ana, "/dashboard"],
    [USERS.carla, "/portal"],
  ] as const) {
    test(`login de ${email} cai em ${home}`, async ({ page }) => {
      await login(page, email);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
    });
  }

  test("anônimo é levado ao /login", async ({ page }) => {
    for (const path of ["/dashboard", "/portal", `/patients/${LUCAS_ID}`, "/finance"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("login com senha errada mostra erro em pt-BR", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(USERS.ana);
    await page.getByLabel("Senha").fill("errada123");
    await page.getByRole("button", { name: "Entrar no Sistema" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  });

  test("responsável acessando /dashboard vai para /portal", async ({ page }) => {
    await login(page, USERS.carla);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("terapeuta não acessa /finance nem /settings", async ({ page }) => {
    await login(page, USERS.ana);
    for (const path of ["/finance", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test("recepção não vê a aba Prontuário de Lucas", async ({ page }) => {
    await login(page, USERS.reception);
    await page.goto(`/patients/${LUCAS_ID}`);
    await expect(page.getByRole("heading", { name: "Lucas Silva" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dados", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Prontuário" })).toHaveCount(0);
    // Forcing the tab by URL falls back to "Dados".
    await page.goto(`/patients/${LUCAS_ID}?tab=record`);
    await expect(page.getByText("Prontuário sigiloso")).toHaveCount(0);
  });

  test("Ana não abre a ficha do Pedro Santos", async ({ page }) => {
    await login(page, USERS.ana);
    const response = await page.goto(`/patients/${PEDRO_ID}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Pedro Santos")).toHaveCount(0);
  });
});
