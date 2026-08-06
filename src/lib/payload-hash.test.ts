import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { payloadSha256 } from "@/lib/payload-hash";

describe("payloadSha256", () => {
  it("matches the value CloudFront signs, as produced by sha256sum", async () => {
    // The literal is the hash the deployed API accepted for this exact body, so a
    // regression here is the same 403-masked-as-404 that cost a whole deploy.
    await expect(payloadSha256('{"url":"http://127.0.0.1/","language":"en"}')).resolves.toBe(
      "6aba88201f28b5b04d327f6237738750738ff0623992278240853b836cbe4d6c",
    );
  });

  it("agrees with node's crypto for a non-ASCII body", async () => {
    const body = JSON.stringify({ url: "https://例え.jp", language: "ja" });
    await expect(payloadSha256(body)).resolves.toBe(
      createHash("sha256").update(body, "utf8").digest("hex"),
    );
  });

  it("hashes the empty string to the well-known SigV4 empty-payload value", async () => {
    await expect(payloadSha256("")).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns 64 lowercase hex characters, zero-padded", async () => {
    await expect(payloadSha256("a")).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
