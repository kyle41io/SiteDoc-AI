// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class { send = send; },
  GetParametersCommand: class { constructor(public readonly input: unknown) {} },
}));

const { hydrateSecrets, resetSecretsForTests } = await import("./secrets");

beforeEach(() => {
  send.mockReset();
  resetSecretsForTests();
  delete process.env.SSM_PREFIX;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});
afterEach(() => resetSecretsForTests());

describe("hydrateSecrets", () => {
  it("does nothing without SSM_PREFIX, so local dev uses real env vars", async () => {
    await hydrateSecrets();

    expect(send).not.toHaveBeenCalled();
  });

  it("fetches only the missing parameters, in one call", async () => {
    process.env.SSM_PREFIX = "/sitedoc-ai/";
    process.env.ANTHROPIC_API_KEY = "already-set";
    send.mockResolvedValue({
      Parameters: [{ Name: "/sitedoc-ai/OPENAI_API_KEY", Value: "from-ssm" }],
    });

    await hydrateSecrets();

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].input).toEqual({
      Names: ["/sitedoc-ai/OPENAI_API_KEY"],
      WithDecryption: true,
    });
    expect(process.env.OPENAI_API_KEY).toBe("from-ssm");
    expect(process.env.ANTHROPIC_API_KEY).toBe("already-set");
  });

  it("only calls SSM once across invocations, because the container is reused", async () => {
    process.env.SSM_PREFIX = "/sitedoc-ai/";
    send.mockResolvedValue({ Parameters: [] });

    await hydrateSecrets();
    await hydrateSecrets();

    expect(send).toHaveBeenCalledOnce();
  });

  it("does not throw when SSM is unavailable — AI falls back deterministically", async () => {
    process.env.SSM_PREFIX = "/sitedoc-ai/";
    send.mockRejectedValue(new Error("AccessDenied"));

    await expect(hydrateSecrets()).resolves.toBeUndefined();
  });
});
