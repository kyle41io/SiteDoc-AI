import type { LaunchOptions } from "playwright";

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
