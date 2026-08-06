import type { LaunchOptions, Page } from "playwright";

/**
 * `--no-sandbox` is required on unprivileged container hosts (Hugging Face
 * Spaces and many PaaS) where Chromium's sandbox can't initialize and the
 * browser otherwise refuses to start. We only ever drive SSRF-guarded URLs
 * inside an isolated container, so this is the standard, accepted configuration
 * for headless scanning. `--disable-dev-shm-usage` avoids crashes from the
 * small `/dev/shm` that containers typically provide. `--disable-gpu` trims
 * memory on headless hosts (no GPU anyway), which matters on small instances
 * like Render's 512 MB free tier.
 */
const BASE_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

/**
 * Extra args for AWS Lambda, whose microVM sandbox blocks syscalls Chromium's
 * zygote needs to fork renderer processes. The failure is quiet and easy to
 * misread: the browser process itself starts fine, `launch()` and
 * `newContext()` resolve, and then the first `newPage()` rejects with "Target
 * page, context or browser has been closed" while CloudWatch shows a 3-second
 * invocation, no stack trace, and memory nowhere near the limit.
 *
 * `--single-process` runs the renderer inside the browser process, and
 * `--no-zygote` stops Chromium forking the zygote it would no longer use. They
 * go together — `--single-process` alone still spawns one. This is the same
 * pair chrome-aws-lambda popularized, and the cost is that a page crash now
 * takes the whole browser with it, which for a one-audit-per-invocation worker
 * is the outcome either way.
 */
const LAMBDA_ARGS = ["--single-process", "--no-zygote"];

/**
 * Shared headless Chromium launch options for the scanner and the PDF renderer.
 *
 * Read once at import: a function's execution environment does not change
 * underneath it, and both handlers launch Chromium on nearly every invocation.
 */
export const CHROMIUM_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  args: [...BASE_ARGS, ...(process.env.AWS_LAMBDA_FUNCTION_NAME ? LAMBDA_ARGS : [])],
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
