// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { S3ArtifactStore } from "@/lib/store/s3-artifact-store";

function store(send: ReturnType<typeof vi.fn>, stagingRoot: string) {
  return new S3ArtifactStore({
    bucket: "sitedoc-artifacts",
    client: { send } as never,
    stagingRoot,
  });
}

describe("S3ArtifactStore", () => {
  it("stages in a writable temp directory, because /var/task is read-only", () => {
    const s = store(vi.fn(), "/tmp");

    expect(s.stagingDirectory("abc")).toBe(path.join("/tmp", "abc"));
  });

  it("returns the CloudFront path shape, matching the local store", () => {
    expect(store(vi.fn(), "/tmp").urlFor("abc", "desktop.png")).toBe(
      "/artifacts/abc/desktop.png",
    );
  });

  it("uploads each staged file under the audit prefix, immutably cached", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sitedoc-s3-"));
    await mkdir(path.join(root, "abc"), { recursive: true });
    await writeFile(path.join(root, "abc", "desktop.png"), "png-bytes");
    await writeFile(path.join(root, "abc", "mobile.png"), "png-bytes");
    const send = vi.fn().mockResolvedValue({});

    await store(send, root).publish("abc", ["desktop.png", "mobile.png"]);

    expect(send).toHaveBeenCalledTimes(2);
    const first = send.mock.calls[0][0].input;
    expect(first.Bucket).toBe("sitedoc-artifacts");
    expect(first.Key).toBe("audits/abc/desktop.png");
    expect(first.ContentType).toBe("image/png");
    expect(first.CacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("propagates an upload failure so the scan is marked failed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sitedoc-s3-"));
    await mkdir(path.join(root, "abc"), { recursive: true });
    await writeFile(path.join(root, "abc", "desktop.png"), "png-bytes");
    const send = vi.fn().mockRejectedValue(new Error("AccessDenied"));

    await expect(store(send, root).publish("abc", ["desktop.png"])).rejects.toThrow(
      "AccessDenied",
    );
  });
});
