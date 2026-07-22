import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { LOCALES } from "@/i18n/config";

/** Collect the dotted paths of any function-valued leaves in `value`. */
function functionPaths(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [path || "<root>"];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      functionPaths(child, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe("dictionaries", () => {
  // Dictionaries are passed from a Server Component (the /report/[id] page) to a
  // Client Component (ReportView) as a prop. React cannot serialize functions
  // across that boundary, so a function anywhere in a dictionary 500s every
  // report page. Keep dictionary values plain data — do interpolation in code.
  it.each(LOCALES)("has no function-valued entries (RSC-serializable): %s", (locale) => {
    expect(functionPaths(dictionaries[locale])).toEqual([]);
  });
});
