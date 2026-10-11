// Ad-hoc responsive audit: logs in and reports pages whose content is wider than the viewport.
// Usage: node e2e/responsive-audit.mjs <email> <outDir> <path...>
import { chromium } from "@playwright/test";

const [email, outDir, ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
await page.goto("http://localhost:3457/login");
await page.getByLabel("E-mail").fill(email);
await page.getByLabel("Senha").fill("Despertar@2026");
await page.getByRole("button", { name: "Entrar no Sistema" }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"));
for (const path of paths) {
  await page.goto(`http://localhost:3457${path}`);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const name = path.replace(/[^a-z0-9]+/gi, "_") || "root";
  await page.screenshot({ path: `${outDir}/${email.split("@")[0]}${name}.png`, fullPage: true });
  console.log(`${overflow > 1 ? "OVERFLOW " + overflow + "px" : "ok"}\t${path}`);
}
await browser.close();
