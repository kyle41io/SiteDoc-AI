import { describe, expect, it } from "vitest";
import { validatePublicHttpUrl } from "@/lib/url-validation";

describe("validatePublicHttpUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(validatePublicHttpUrl("ftp://example.com")).rejects.toThrow(
      /http and https/i,
    );
    await expect(validatePublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects malformed input", async () => {
    await expect(validatePublicHttpUrl("not a url")).rejects.toThrow(
      /valid absolute url/i,
    );
    await expect(validatePublicHttpUrl("")).rejects.toThrow();
  });

  it("rejects embedded credentials", async () => {
    await expect(
      validatePublicHttpUrl("https://user:pass@example.com"),
    ).rejects.toThrow(/credentials/i);
  });

  it("rejects localhost and local-network hostnames", async () => {
    await expect(validatePublicHttpUrl("http://localhost")).rejects.toThrow(
      /local and private/i,
    );
    await expect(validatePublicHttpUrl("http://app.local")).rejects.toThrow(
      /local and private/i,
    );
    await expect(
      validatePublicHttpUrl("http://service.localhost"),
    ).rejects.toThrow(/local and private/i);
  });

  it("rejects private IPv4 literals", async () => {
    for (const host of [
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://192.168.1.10",
      "http://169.254.1.1",
      "http://172.16.0.1",
      "http://0.0.0.0",
    ]) {
      await expect(validatePublicHttpUrl(host)).rejects.toThrow(
        /local and private/i,
      );
    }
  });

  it("rejects private IPv6 literals", async () => {
    await expect(validatePublicHttpUrl("http://[::1]")).rejects.toThrow(
      /local and private/i,
    );
  });

  it("accepts a public IP literal without DNS lookup", async () => {
    // IP literals skip DNS resolution, so this stays offline-safe.
    const result = await validatePublicHttpUrl("https://8.8.8.8/path");
    expect(result).toBe("https://8.8.8.8/path");
  });
});
