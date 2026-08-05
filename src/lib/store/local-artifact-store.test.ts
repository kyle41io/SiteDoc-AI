import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalArtifactStore } from "@/lib/store/local-artifact-store";

describe("LocalArtifactStore", () => {
  it("stages files in a per-audit directory under the configured root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sitedoc-artifacts-"));
    const store = new LocalArtifactStore(root);

    expect(store.stagingDirectory("abc")).toBe(path.join(root, "abc"));
  });

  it("publish is a no-op because staged files are already final", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sitedoc-artifacts-"));
    const store = new LocalArtifactStore(root);

    await expect(store.publish("abc", ["desktop.png"])).resolves.toBeUndefined();
  });

  it("serves artifacts through the existing route so behavior is unchanged", () => {
    const store = new LocalArtifactStore("/tmp/whatever");

    expect(store.urlFor("abc", "desktop.png")).toBe("/api/artifacts/abc/desktop.png");
  });
});
