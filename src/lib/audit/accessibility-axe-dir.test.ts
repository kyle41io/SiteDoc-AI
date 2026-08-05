import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAxeDir() {
  vi.resetModules();
  const mod = await import("@/lib/audit/accessibility");
  return mod.axeDirectory();
}

afterEach(() => {
  delete process.env.SITEDOC_AXE_DIR;
});

describe("axeDirectory", () => {
  it("defaults to the installed package under the working directory", async () => {
    expect(await loadAxeDir()).toBe(
      path.join(process.cwd(), "node_modules", "axe-core"),
    );
  });

  it("honors SITEDOC_AXE_DIR so the Lambda image can relocate it", async () => {
    process.env.SITEDOC_AXE_DIR = "/var/task/node_modules/axe-core";
    expect(await loadAxeDir()).toBe("/var/task/node_modules/axe-core");
  });
});
