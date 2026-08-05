import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

const SECRET_NAMES = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

let hydrated: Promise<void> | undefined;

/**
 * Copy secrets from SSM Parameter Store into `process.env` before anything
 * reads them.
 *
 * Gating rules, each one deliberate:
 *  - No `SSM_PREFIX` means do nothing, so local development and tests keep
 *    using real environment variables and never touch AWS.
 *  - A variable that is already populated is never requested, so an explicit
 *    override always wins.
 *  - Everything still missing is fetched in ONE `GetParameters` call.
 *  - Failure is swallowed: AI enrichment falls back deterministically, and a
 *    missing key must not fail an otherwise good audit.
 */
export async function hydrateSecrets(names: string[] = SECRET_NAMES): Promise<void> {
  hydrated ??= (async () => {
    const prefix = process.env["SSM_PREFIX"];
    if (!prefix) return;

    const missing = names.filter((name) => !process.env[name]);
    if (missing.length === 0) return;

    const client = new SSMClient({});

    try {
      const result = await client.send(
        new GetParametersCommand({
          Names: missing.map((name) => `${prefix.replace(/\/$/, "")}/${name}`),
          WithDecryption: true,
        }),
      );

      for (const parameter of result.Parameters ?? []) {
        const key = parameter.Name?.split("/").pop();
        if (key && parameter.Value) process.env[key] = parameter.Value;
      }
    } catch (error) {
      console.error("[secrets] could not read from SSM:", error);
    }
  })();

  return hydrated;
}

/** Test-only: clear the module-scoped memo. */
export function resetSecretsForTests(): void {
  hydrated = undefined;
}
