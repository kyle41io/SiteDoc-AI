import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Lambda bundles — minified esbuild output, not source.
    "dist-lambda/**",
    // CloudFront Functions runtime, not Node: `handler` is invoked by name from
    // outside the file, so every rule about unused top-level bindings misfires.
    "infra/**",
  ]),
]);

export default eslintConfig;
