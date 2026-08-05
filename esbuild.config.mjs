import { build } from "esbuild";

/**
 * Bundles each Lambda entry point separately.
 *
 * Two different externals policies, on purpose:
 *  - `api` runs on the managed `nodejs22.x` runtime, which ships AWS SDK v3,
 *    so bundling the SDK would add megabytes of cold-start weight for nothing.
 *  - `scan` and `pdf` run on a Playwright base image that has NO AWS SDK, so
 *    the SDK must be bundled. `playwright` stays external there because it has
 *    to resolve from the image, next to its browser binaries.
 *
 * `scan`/`pdf` target node20 as a safe floor for the Playwright image's own
 * Node; raise it once the image's version is confirmed.
 */
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  minify: true,
  sourcemap: true,
  logLevel: "info",
  tsconfig: "tsconfig.json",
  alias: { "@": new URL("./src", import.meta.url).pathname },
};

const targets = [
  {
    name: "api",
    entry: "lambda/api.ts",
    target: "node22",
    // Playwright is external here even though this function never drives a
    // browser: `productionDeps.scan` imports it lazily, and esbuild follows a
    // dynamic import unless the package is external. It also cannot be bundled
    // at all — playwright-core requires `chromium-bidi` paths that do not
    // resolve statically. Marking it external leaves a `require` that only the
    // scan worker ever reaches.
    external: ["@aws-sdk/*", "playwright", "playwright-core"],
  },
  {
    name: "scan",
    entry: "lambda/scan.ts",
    target: "node20",
    external: ["playwright", "playwright-core"],
  },
  {
    name: "pdf",
    entry: "lambda/pdf.ts",
    target: "node20",
    external: ["playwright", "playwright-core"],
  },
];

await Promise.all(
  targets.map(({ name, entry, target, external }) =>
    build({
      ...shared,
      entryPoints: [entry],
      outfile: `dist-lambda/${name}/index.js`,
      target,
      external,
    }),
  ),
);
