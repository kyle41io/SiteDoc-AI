import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return (await import("@/lib/api-base")).apiUrl;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("apiUrl", () => {
  it("returns a same-origin path when no base is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "");
    expect((await load())("/api/audits")).toBe("/api/audits");
  });

  it("prefixes the configured base in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://localhost:4000");
    expect((await load())("/api/audits")).toBe("http://localhost:4000/api/audits");
  });

  it("does not double the slash when the base has a trailing one", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://localhost:4000/");
    expect((await load())("/api/audits")).toBe("http://localhost:4000/api/audits");
  });
});
