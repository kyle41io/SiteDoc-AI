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
import {
  accessibilityScore,
  overallScore,
  scoreFromCounts,
  severityFromIndex,
} from "@/lib/audit/scoring";
import { auditStrings, type AuditStrings } from "@/lib/audit/audit-i18n";
import {
  buildAccessibilityIssues,
  countAxeImpacts,
  runAxe,
  type AxeViolation,
} from "@/lib/audit/accessibility";
import { createRequestSafetyGuard } from "@/lib/url-validation";

type ScanOptions = {
  auditId: string;
  url: string;
  startedAt: string;
  /** Locale for generated audit content (summary, issues, metrics). */
  language?: string;
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

function buildIssues(
  consoleErrors: ConsoleError[],
  failedRequests: FailedRequest[],
  s: AuditStrings,
) {
  const consoleIssues: AuditIssue[] = consoleErrors.slice(0, 5).map((error, index) => ({
    id: `console-${index + 1}`,
    category: "Console",
    severity: severityFromIndex(index),
    title: s.consoleIssueTitle,
    selector: error.url ? `${error.url}:${error.lineNumber ?? 0}` : "console.error",
    detail: error.text,
    fix: s.consoleIssueFix,
  }));

  const requestIssues: AuditIssue[] = failedRequests.slice(0, 5).map((request, index) => ({
    id: `network-${index + 1}`,
    category: "Network",
    severity: request.status && request.status >= 500 ? "High" : severityFromIndex(index),
    title: request.status
      ? s.networkIssueTitleStatus(request.status)
      : s.networkIssueTitleFailed,
    selector: `${request.method} ${request.resourceType}`,
    detail: `${request.url} - ${request.failureText}`,
    fix: s.networkIssueFix,
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
  analyze?: { language?: string },
): Promise<{ finalUrl: string; violations: AxeViolation[] | null }> {
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

    const violations = analyze ? await runAxe(page, analyze.language) : null;

    await page.screenshot({
      fullPage: true,
      path: path.join(artifactDirectory, filename),
    });

    return { finalUrl: response?.url() ?? page.url(), violations };
  } finally {
    await context?.close();
  }
}

function buildMetrics(
  record: {
    durationMs: number;
    consoleErrors: ConsoleError[];
    failedRequests: FailedRequest[];
    finalUrl: string;
  },
  s: AuditStrings,
): AuditMetric[] {
  return [
    {
      label: s.metricScanDurationLabel,
      value: `${(record.durationMs / 1000).toFixed(1)}s`,
      detail: s.metricScanDurationDetail,
    },
    {
      label: s.metricConsoleErrorsLabel,
      value: String(record.consoleErrors.length),
      detail: s.metricConsoleErrorsDetail,
    },
    {
      label: s.metricFailedRequestsLabel,
      value: String(record.failedRequests.length),
      detail: s.metricFailedRequestsDetail,
    },
    {
      label: s.metricFinalUrlLabel,
      value: new URL(record.finalUrl).hostname,
      detail: record.finalUrl,
    },
  ];
}

function buildSummary(
  consoleErrors: ConsoleError[],
  failedRequests: FailedRequest[],
  durationMs: number,
  s: AuditStrings,
) {
  if (consoleErrors.length === 0 && failedRequests.length === 0) {
    return s.summaryClean((durationMs / 1000).toFixed(1));
  }

  return s.summaryIssues(consoleErrors.length, failedRequests.length);
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
    const { finalUrl, violations } = await captureViewport(
      browser,
      options.url,
      artifactDirectory,
      "desktop.png",
      { width: 1440, height: 1000 },
      { consoleErrors, failedRequests },
      { language: options.language },
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
    const technical = scoreFromCounts(
      dedupedConsoleErrors.length,
      dedupedFailedRequests.length,
      durationMs,
    );
    // `violations` is null only if the accessibility scan failed to run; in
    // that case we omit the category rather than report a misleading score.
    const accessibility = violations
      ? accessibilityScore(countAxeImpacts(violations))
      : undefined;
    const scores = {
      overall: overallScore({ technical: technical.overall, accessibility }),
      accessibility,
      scanner: technical.scanner,
      console: technical.console,
      network: technical.network,
    };
    const s = auditStrings(options.language);

    return {
      id: options.auditId,
      url: options.url,
      finalUrl,
      status: "completed",
      language: options.language,
      createdAt: options.startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      screenshots: {
        desktop: getAuditArtifactUrl(options.auditId, "desktop.png"),
        mobile: getAuditArtifactUrl(options.auditId, "mobile.png"),
      },
      consoleErrors: dedupedConsoleErrors,
      failedRequests: dedupedFailedRequests,
      issues: [
        ...(violations ? buildAccessibilityIssues(violations, s) : []),
        ...buildIssues(dedupedConsoleErrors, dedupedFailedRequests, s),
      ],
      metrics: buildMetrics(
        {
          durationMs,
          consoleErrors: dedupedConsoleErrors,
          failedRequests: dedupedFailedRequests,
          finalUrl,
        },
        s,
      ),
      scores,
      summary: buildSummary(dedupedConsoleErrors, dedupedFailedRequests, durationMs, s),
    };
  } finally {
    await browser.close();
  }
}
