import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  AuditIssue,
  AuditMetric,
  AuditRecord,
  ConsoleError,
  FailedRequest,
} from "@/lib/audit-types";
import {
  getAuditArtifactDirectory,
  getAuditArtifactUrl,
} from "@/lib/store";
import { scoreFromCounts, severityFromIndex } from "@/lib/audit/scoring";
import { createRequestSafetyGuard } from "@/lib/url-validation";

type ScanOptions = {
  auditId: string;
  url: string;
  startedAt: string;
};

const navigationTimeoutMs = 30_000;

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildIssues(consoleErrors: ConsoleError[], failedRequests: FailedRequest[]) {
  const consoleIssues: AuditIssue[] = consoleErrors.slice(0, 5).map((error, index) => ({
    id: `console-${index + 1}`,
    category: "Console",
    severity: severityFromIndex(index),
    title: "Browser console error detected",
    selector: error.url ? `${error.url}:${error.lineNumber ?? 0}` : "console.error",
    detail: error.text,
    fix: "Inspect the browser console stack trace, fix the failing client-side code, and add regression coverage for the affected UI flow.",
  }));

  const requestIssues: AuditIssue[] = failedRequests.slice(0, 5).map((request, index) => ({
    id: `network-${index + 1}`,
    category: "Network",
    severity: request.status && request.status >= 500 ? "High" : severityFromIndex(index),
    title: request.status
      ? `Request returned HTTP ${request.status}`
      : "Network request failed",
    selector: `${request.method} ${request.resourceType}`,
    detail: `${request.url} - ${request.failureText}`,
    fix: "Confirm the resource URL, server status, deployment configuration, CORS policy, and retry/error handling for this request.",
  }));

  return [...consoleIssues, ...requestIssues];
}

async function createGuardedContext(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    viewport,
  });
  const isSafeRequestUrl = createRequestSafetyGuard();

  await context.route("**/*", async (route) => {
    const safe = await isSafeRequestUrl(route.request().url());

    if (!safe) {
      await route.abort("blockedbyclient");
      return;
    }

    await route.continue();
  });

  return context;
}

function bindPageObservers(page: Page, consoleErrors: ConsoleError[], failedRequests: FailedRequest[]) {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const location = message.location();

    consoleErrors.push({
      text: message.text(),
      type: message.type(),
      url: location.url,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    });
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failureText: request.failure()?.errorText ?? "Request failed",
    });
  });

  page.on("response", (response) => {
    const status = response.status();

    if (status < 400) {
      return;
    }

    const request = response.request();

    failedRequests.push({
      url: response.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failureText: response.statusText() || `HTTP ${status}`,
      status,
    });
  });
}

async function captureViewport(
  browser: Browser,
  url: string,
  artifactDirectory: string,
  filename: string,
  viewport: { width: number; height: number },
  observers?: {
    consoleErrors: ConsoleError[];
    failedRequests: FailedRequest[];
  },
) {
  let context: BrowserContext | undefined;

  try {
    context = await createGuardedContext(browser, viewport);
    const page = await context.newPage();

    if (observers) {
      bindPageObservers(page, observers.consoleErrors, observers.failedRequests);
    }

    const response = await page.goto(url, {
      timeout: navigationTimeoutMs,
      waitUntil: "domcontentloaded",
    });

    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.screenshot({
      fullPage: true,
      path: path.join(artifactDirectory, filename),
    });

    return response?.url() ?? page.url();
  } finally {
    await context?.close();
  }
}

function buildMetrics(record: {
  durationMs: number;
  consoleErrors: ConsoleError[];
  failedRequests: FailedRequest[];
  finalUrl: string;
}): AuditMetric[] {
  return [
    {
      label: "Scan duration",
      value: `${(record.durationMs / 1000).toFixed(1)}s`,
      detail: "Time spent launching Chromium, loading the page, and capturing screenshots.",
    },
    {
      label: "Console errors",
      value: String(record.consoleErrors.length),
      detail: "Browser console messages with error severity from the desktop scan.",
    },
    {
      label: "Failed requests",
      value: String(record.failedRequests.length),
      detail: "Network failures and HTTP 4xx/5xx responses observed during page load.",
    },
    {
      label: "Final URL",
      value: new URL(record.finalUrl).hostname,
      detail: record.finalUrl,
    },
  ];
}

function buildSummary(consoleErrors: ConsoleError[], failedRequests: FailedRequest[], durationMs: number) {
  if (consoleErrors.length === 0 && failedRequests.length === 0) {
    return `The page loaded successfully in ${(durationMs / 1000).toFixed(
      1,
    )}s with no console errors or failed network requests detected during the scan.`;
  }

  return `The scanner captured ${consoleErrors.length} console error${
    consoleErrors.length === 1 ? "" : "s"
  } and ${failedRequests.length} failed network request${
    failedRequests.length === 1 ? "" : "s"
  }. Prioritize high-impact client errors and failed critical resources before deeper UX or SEO review.`;
}

export async function runPlaywrightScan(options: ScanOptions): Promise<AuditRecord> {
  const started = Date.now();
  const artifactDirectory = getAuditArtifactDirectory(options.auditId);
  const consoleErrors: ConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];

  await mkdir(artifactDirectory, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const finalUrl = await captureViewport(
      browser,
      options.url,
      artifactDirectory,
      "desktop.png",
      { width: 1440, height: 1000 },
      { consoleErrors, failedRequests },
    );

    await captureViewport(browser, options.url, artifactDirectory, "mobile.png", {
      width: 390,
      height: 844,
    });

    const durationMs = Date.now() - started;
    const dedupedConsoleErrors = uniqueBy(
      consoleErrors,
      (error) => `${error.url}:${error.lineNumber}:${error.text}`,
    );
    const dedupedFailedRequests = uniqueBy(
      failedRequests,
      (request) => `${request.method}:${request.status ?? "failed"}:${request.url}`,
    );
    const scores = scoreFromCounts(
      dedupedConsoleErrors.length,
      dedupedFailedRequests.length,
      durationMs,
    );

    return {
      id: options.auditId,
      url: options.url,
      finalUrl,
      status: "completed",
      createdAt: options.startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      screenshots: {
        desktop: getAuditArtifactUrl(options.auditId, "desktop.png"),
        mobile: getAuditArtifactUrl(options.auditId, "mobile.png"),
      },
      consoleErrors: dedupedConsoleErrors,
      failedRequests: dedupedFailedRequests,
      issues: buildIssues(dedupedConsoleErrors, dedupedFailedRequests),
      metrics: buildMetrics({
        durationMs,
        consoleErrors: dedupedConsoleErrors,
        failedRequests: dedupedFailedRequests,
        finalUrl,
      }),
      scores,
      summary: buildSummary(dedupedConsoleErrors, dedupedFailedRequests, durationMs),
    };
  } finally {
    await browser.close();
  }
}
