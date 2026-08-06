import { afterEach, describe, expect, it, vi } from "vitest";

// The options are built at import time, so each case needs a fresh module.
async function loadArgs() {
  vi.resetModules();
  return (await import("@/lib/chromium")).CHROMIUM_LAUNCH_OPTIONS.args ?? [];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CHROMIUM_LAUNCH_OPTIONS", () => {
  it("always passes the container-host args", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    expect(await loadArgs()).toEqual(["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]);
  });

  it("adds the single-process pair on Lambda, where forking a renderer fails", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "sitedoc-scan");
    const args = await loadArgs();
    // Both or neither: `--single-process` on its own still spawns a zygote.
    expect(args).toContain("--single-process");
    expect(args).toContain("--no-zygote");
  });

  it("keeps a local run out of single-process mode", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    expect(await loadArgs()).not.toContain("--single-process");
  });
});
