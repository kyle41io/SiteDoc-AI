import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CHROMIUM_LAUNCH_OPTIONS, shimEvaluateHelpers } from "@/lib/chromium";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  AuditIssue,
  AuditMetric,
  AuditRecord,
  ConsoleError,
  FailedRequest,
} from "@/lib/audit-types";
import { artifactStore } from "@/lib/store";
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
import { analyzeSeo, type SeoSnapshot } from "@/lib/audit/seo";
import { analyzePerformance, type PerfSnapshot } from "@/lib/audit/performance";
import { createRequestSafetyGuard } from "@/lib/url-validation";

/** Extract Navigation/Resource Timing facts from the loaded page. */
async function extractPerfSnapshot(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];

    let totalTransferBytes = nav?.transferSize ?? 0;
    let imageBytes = 0;
    for (const r of resources) {
      // transferSize is 0 for cross-origin resources without Timing-Allow-Origin,
      // so these totals can undercount third-party assets (documented v1 limit).
      totalTransferBytes += r.transferSize || 0;
      if (r.initiatorType === "img") imageBytes += r.transferSize || 0;
    }

    // Count real stylesheets from the DOM — Resource Timing's "link" initiator
    // also covers preload/icon/preconnect/manifest, which would overcount.
    const stylesheetCount = document.querySelectorAll('link[rel~="stylesheet"]').length;

    return {
      ttfbMs: nav ? nav.responseStart : 0,
      // loadEventEnd is 0 if read before the load event fires (e.g. networkidle
      // timed out); fall back to elapsed time so a slow page isn't reported fast.
      loadMs: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : performance.now(),
      resourceCount: resources.length,
      totalTransferBytes,
      imageBytes,
      stylesheetCount,
    };
  });
}

/** Extract SEO-relevant DOM facts from the loaded page. */
async function extractSeoSnapshot(page: Page): Promise<SeoSnapshot> {
  return page.evaluate(() => {
    const meta = (name: string) =>
      (document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null)?.content ?? null;
    const hasProperty = (property: string) =>
      !!document.querySelector(`meta[property="${property}"]`);
    const images = Array.from(document.querySelectorAll("img"));
    const robots = (meta("robots") ?? "").toLowerCase();

    return {
      title: document.title || null,
      metaDescription: meta("description"),
      h1Count: document.querySelectorAll("h1").length,
      hasCanonical: !!document.querySelector('link[rel="canonical"]'),
      ogTitle: hasProperty("og:title"),
      ogDescription: hasProperty("og:description"),
      ogImage: hasProperty("og:image"),
      htmlLang: document.documentElement.getAttribute("lang"),
      hasViewport: !!document.querySelector('meta[name="viewport"]'),
      robotsNoindex: robots.includes("noindex"),
      imagesTotal: images.length,
      imagesWithAlt: images.filter((img) => img.hasAttribute("alt")).length,
    };
  });
}

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
): Promise<{
  finalUrl: string;
  violations: AxeViolation[] | null;
  seo: SeoSnapshot | null;
  perf: PerfSnapshot | null;
}> {
  let context: BrowserContext | undefined;

  try {
    context = await createGuardedContext(browser, viewport);
    const page = await context.newPage();
    await shimEvaluateHelpers(page);

    if (observers) {
      bindPageObservers(page, observers.consoleErrors, observers.failedRequests);
    }

    const response = await page.goto(url, {
      timeout: navigationTimeoutMs,
      waitUntil: "domcontentloaded",
    });

    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

    const violations = analyze ? await runAxe(page, analyze.language) : null;
    const seo = analyze ? await extractSeoSnapshot(page) : null;
    const perf = analyze ? await extractPerfSnapshot(page) : null;

    await page.screenshot({
      fullPage: true,
      path: path.join(artifactDirectory, filename),
    });

    return { finalUrl: response?.url() ?? page.url(), violations, seo, perf };
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
  const artifactDirectory = artifactStore.stagingDirectory(options.auditId);
  const consoleErrors: ConsoleError[] = [];
  const failedRequests: FailedRequest[] = [];

  await mkdir(artifactDirectory, { recursive: true });

  const browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);

  try {
    const { finalUrl, violations, seo, perf } = await captureViewport(
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

    // Hand the captured PNGs to the artifact store. Local disk is already done;
    // S3 uploads here. The scanner deliberately does not know which.
    await artifactStore.publish(options.auditId, ["desktop.png", "mobile.png"]);

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
    const s = auditStrings(options.language);

    // `violations` is null only if the accessibility scan failed to run; in
    // that case we omit the category rather than report a misleading score.
    const accessibility = violations
      ? accessibilityScore(countAxeImpacts(violations))
      : undefined;
    const seoResult = seo ? analyzeSeo(seo, s) : null;
    const perfResult = perf ? analyzePerformance(perf, s) : null;
    const scores = {
      overall: overallScore({
        technical: technical.overall,
        accessibility,
        seo: seoResult?.score,
        performance: perfResult?.score,
      }),
      accessibility,
      seo: seoResult?.score,
      performance: perfResult?.score,
      scanner: technical.scanner,
      console: technical.console,
      network: technical.network,
    };

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
        desktop: artifactStore.urlFor(options.auditId, "desktop.png"),
        mobile: artifactStore.urlFor(options.auditId, "mobile.png"),
      },
      consoleErrors: dedupedConsoleErrors,
      failedRequests: dedupedFailedRequests,
      issues: [
        ...(violations ? buildAccessibilityIssues(violations, s) : []),
        ...(seoResult?.issues ?? []),
        ...(perfResult?.issues ?? []),
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
