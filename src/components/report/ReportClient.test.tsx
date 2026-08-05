import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REPORT_PATH = "/report/11111111-1111-4111-8111-111111111111";
const pathname = vi.fn(() => REPORT_PATH);
const search = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  // The component reads `?print=1` to drop the action buttons for the PDF.
  useSearchParams: () => search(),
}));

const { LanguageProvider } = await import("@/i18n/provider");
const { ReportClient } = await import("@/components/report/ReportClient");

/**
 * The 404 panel reads the viewer's language through `useI18n`, which the root
 * layout provides in the app — so the test has to provide it too.
 */
function renderClient() {
  return render(
    <LanguageProvider>
      <ReportClient />
    </LanguageProvider>,
  );
}

const record = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status: "completed",
  language: "vi",
  createdAt: "2026-08-05T00:00:00.000Z",
  completedAt: "2026-08-05T00:00:30.000Z",
  screenshots: { desktop: "/artifacts/x/desktop.png", mobile: "/artifacts/x/mobile.png" },
  consoleErrors: [],
  failedRequests: [],
  issues: [],
  metrics: [],
  scores: { overall: 90 },
  summary: "ok",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(record), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  pathname.mockReturnValue(REPORT_PATH);
});

describe("ReportClient", () => {
  it("marks itself ready only once the record has loaded", async () => {
    const { container } = renderClient();

    expect(container.querySelector("[data-report-ready='true']")).toBeNull();

    await waitFor(() =>
      expect(container.querySelector("[data-report-ready='true']")).not.toBeNull(),
    );
  });

  it("renders the audited URL from the fetched record", async () => {
    renderClient();

    // The headline is asserted specifically: `ReportView` also renders the URL
    // with a `title`, so a bare `getByTitle` matches more than one element.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
        "title",
        "https://example.com/",
      ),
    );
  });

  it("renders the 404 panel when the record is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

    renderClient();

    await waitFor(() =>
      expect(document.querySelector("[data-report-missing='true']")).not.toBeNull(),
    );
  });

  it("renders the 404 panel for a malformed id without fetching", async () => {
    // Sticky, not `...Once`: the hook is read on every render, and a one-shot
    // override would hand the effect a valid id on the second call.
    pathname.mockReturnValue("/report/not-an-id");

    renderClient();

    await waitFor(() =>
      expect(document.querySelector("[data-report-missing='true']")).not.toBeNull(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
