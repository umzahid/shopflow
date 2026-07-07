import { defineConfig, devices } from "@playwright/test";

// Runs against the docker-compose stack: `docker compose up -d` first.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Unbounded local parallelism overloads the dev-mode stack (single-worker
  // Next + API on one laptop) and produces spurious timeouts past ~30 tests.
  workers: process.env.CI ? undefined : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // E2E_BROWSER_CHANNEL=chrome runs against installed Google Chrome — handy
    // when the bundled Chromium download is unavailable. Unset = bundled.
    ...(process.env.E2E_BROWSER_CHANNEL
      ? { channel: process.env.E2E_BROWSER_CHANNEL }
      : {}),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
