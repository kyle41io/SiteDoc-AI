import { defineConfig } from "@playwright/test";

/**
 * E2E config. Specs live in `e2e/` (vitest only scans `src/`, so the two
 * runners don't collide). The webServer boots the production build; locally it
 * reuses an already-running dev/prod server on :3000.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  /**
   * Serves the static export plus the API from one origin, approximating the
   * CloudFront routing table so routing mistakes surface locally.
   */
  webServer: {
    command: "npm run serve:local",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
