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
const BASE_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  // `--disable-gpu` trims memory on headless hosts (no GPU anyway), which
  // matters on small instances like Render's 512 MB free tier. Note that it
  // disables GPU *acceleration*, not the GPU process — see LAMBDA_ARGS.
  "--disable-gpu",
];

/**
 * Extra args for AWS Lambda, whose sandbox blocks the namespace syscalls
 * Chromium's own sandbox is built on. `--no-sandbox` is not enough: with it
 * alone, Chromium still routes child processes through the zygote, every fork
 * dies in `credentials.cc` with "Operation not permitted", and after six failed
 * GPU-process launches the browser deliberately exits ("GPU process isn't
 * usable. Goodbye."). All the caller sees is the next `newPage()` rejecting with
 * "Target page, context or browser has been closed" — with Chromium's stderr
 * discarded, which is why this took three deploys to pin down.
 *
 *  - `--no-zygote` spawns children directly instead of forking a zygote whose
 *    children die during sandbox setup.
 *  - `--in-process-gpu` removes the GPU process entirely. This is the one that
 *    matters: a GPU process that cannot start is fatal to the whole browser,
 *    and `--disable-gpu` does not prevent it from being launched.
 *  - `--disable-gpu-sandbox` covers the case where something still asks for a
 *    separate GPU process; its sandbox is not covered by `--no-sandbox`.
 *
 * Deliberately not `--single-process`: Playwright does not support it, it was
 * tried first, and it changed nothing because the GPU process was the problem.
 */
const LAMBDA_ARGS = ["--no-zygote", "--in-process-gpu", "--disable-gpu-sandbox"];

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
