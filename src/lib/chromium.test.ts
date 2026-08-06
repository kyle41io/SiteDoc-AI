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

  it("removes the GPU process and the zygote on Lambda", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "sitedoc-scan");
    const args = await loadArgs();
    // --in-process-gpu is the load-bearing one: on Lambda a GPU process that
    // cannot fork takes the whole browser down with it.
    expect(args).toContain("--in-process-gpu");
    expect(args).toContain("--no-zygote");
    expect(args).toContain("--disable-gpu-sandbox");
    expect(args).toContain("--no-sandbox");
  });

  it("never passes --single-process, which Playwright does not support", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "sitedoc-scan");
    expect(await loadArgs()).not.toContain("--single-process");
  });

  it("leaves a non-Lambda run on the stock multi-process browser", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    const args = await loadArgs();
    expect(args).not.toContain("--no-zygote");
    expect(args).not.toContain("--in-process-gpu");
  });
});
