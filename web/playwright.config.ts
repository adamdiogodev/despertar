import { defineConfig, devices } from "@playwright/test";

// E2E against the already-running dev server and local Supabase.
// Requires a fresh seed: run `npx supabase db reset` before `npm run test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3457",
    screenshot: "only-on-failure",
    // Disk is tight on this machine; enable traces locally with --trace on when debugging.
    trace: "off",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  // channel "chromium" runs the full Chromium build in new headless mode (no separate headless shell needed).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } } }],
});
