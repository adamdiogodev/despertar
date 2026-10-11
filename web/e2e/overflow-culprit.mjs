// Lists elements wider than the viewport on a page (debug helper for responsive issues).
import { chromium } from "@playwright/test";
const [email, path] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
await page.goto("http://localhost:3457/login");
await page.getByLabel("E-mail").fill(email);
await page.getByLabel("Senha").fill("Despertar@2026");
await page.getByRole("button", { name: "Entrar no Sistema" }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"));
await page.goto(`http://localhost:3457${path}`);
await page.waitForLoadState("networkidle");
console.log(await page.evaluate(() =>
  [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .slice(0, 8)
    .map((el) => `${el.tagName}.${String(el.className).slice(0, 90)} right=${Math.round(el.getBoundingClientRect().right)}`)
    .join("\n")));
await browser.close();
