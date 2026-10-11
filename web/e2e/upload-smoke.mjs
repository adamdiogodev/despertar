// Smoke test of the direct-to-storage upload: a guardian sends a PDF from the portal.
import { chromium } from "@playwright/test";
import path from "node:path";

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
await page.goto("http://localhost:3457/login");
await page.getByLabel("E-mail").fill("carla@despertar.local");
await page.getByLabel("Senha").fill("Despertar@2026");
await page.getByRole("button", { name: "Entrar no Sistema" }).click();
await page.waitForURL("**/portal");
await page.goto("http://localhost:3457/portal/documents");
await page.getByLabel("Nome do documento").fill("Upload direto — teste automatizado");
await page.locator('input[type="file"]').setInputFiles(path.resolve("e2e/fixtures/sample.pdf"));
await page.getByText("✓ sample.pdf").waitFor({ timeout: 20000 });
console.log("browser upload ok");
await page.locator('input[type="file"]').locator("xpath=ancestor::form").locator('button[type="submit"]').click();
await page.getByText(/enviado|recebid|sucesso/i).first().waitFor({ timeout: 20000 });
console.log("form submit ok:", await page.getByRole("status").first().textContent().catch(() => "(status text not found)"));
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
