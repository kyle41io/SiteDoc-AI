import type { LaunchOptions, Page } from "playwright";

/**
 * Shared headless Chromium launch options for the scanner and the PDF renderer.
 *
 * `--no-sandbox` is required on unprivileged container hosts (Hugging Face
 * Spaces and many PaaS) where Chromium's sandbox can't initialize and the
 * browser otherwise refuses to start. We only ever drive SSRF-guarded URLs
 * inside an isolated container, so this is the standard, accepted configuration
 * for headless scanning. `--disable-dev-shm-usage` avoids crashes from the
 * small `/dev/shm` that containers typically provide.
 */
export const CHROMIUM_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  // `--disable-gpu` trims memory on headless hosts (no GPU anyway), which
  // matters on small instances like Render's 512 MB free tier.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
};

/**
 * Define a no-op `__name` in the page before anything evaluates.
 *
 * esbuild's `keepNames` (on by default under `tsx`, and available to any bundler
 * config) rewrites `function f(){}` as `__name(function f(){}, "f")`. Playwright
 * serializes the *compiled* source of every `page.evaluate` callback and runs it
 * in the browser, where that helper does not exist — so the callback dies with
 * `ReferenceError: __name is not defined` and the whole scan fails.
 *
 * Passed as a string on purpose: a function argument here would itself be
 * compiled, and would hit the very problem it is meant to fix.
 */
const EVALUATE_NAME_SHIM = "globalThis.__name = globalThis.__name || ((fn) => fn);";

/** Install {@link EVALUATE_NAME_SHIM} for every document this page loads. */
export async function shimEvaluateHelpers(page: Page): Promise<void> {
  await page.addInitScript({ content: EVALUATE_NAME_SHIM });
}
