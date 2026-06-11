"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AuditCategory, AuditRecord } from "@/lib/audit-types";
import { CATEGORY_ACCENT } from "@/lib/audit/category-meta";
import { celestialTier, CELESTIAL_COLOR } from "@/lib/celestial";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CategoryBadge, SeverityBadge } from "@/components/ui/badges";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { HealthOrbMount, OrbFallback } from "@/components/three/HealthOrbMount";

type PageStatus = "idle" | "running" | "completed" | "failed";
type FilterValue = AuditCategory | "All";
type DetailTab = "overview" | "issues" | "screenshots" | "metrics";

/** Score tiles for every category that has a measured value (overall is the orb). */
function scoreBand(report: AuditRecord | null) {
  const s = report?.scores;
  const cards: Array<{ key: string; catKey: AuditCategory; value?: number; accent: string }> = [
    { key: "accessibility", catKey: "Accessibility", value: s?.accessibility, accent: CATEGORY_ACCENT.Accessibility },
    { key: "seo", catKey: "SEO", value: s?.seo, accent: CATEGORY_ACCENT.SEO },
    { key: "performance", catKey: "Performance", value: s?.performance, accent: CATEGORY_ACCENT.Performance },
    { key: "ux", catKey: "UX", value: s?.ux, accent: CATEGORY_ACCENT.UX },
    { key: "bestPractices", catKey: "BestPractices", value: s?.bestPractices, accent: CATEGORY_ACCENT.BestPractices },
    { key: "scanner", catKey: "Scanner", value: s?.scanner, accent: CATEGORY_ACCENT.Scanner },
    { key: "console", catKey: "Console", value: s?.console, accent: CATEGORY_ACCENT.Console },
    { key: "network", catKey: "Network", value: s?.network, accent: CATEGORY_ACCENT.Network },
  ];
  return cards.filter((card) => typeof card.value === "number");
}

function ScreenshotPanel({
  label,
  emptyLabel,
  src,
}: {
  label: string;
  emptyLabel: string;
  src?: string;
}) {
  if (!src) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03]">
        <span className="rounded-md bg-white/10 px-3 py-1 text-sm text-[var(--muted)]">
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <a
      className="group block overflow-hidden rounded-xl border border-white/12 bg-black/20 lift"
      href={src}
      rel="noreferrer"
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={label}
        className="aspect-[16/10] w-full object-cover object-top"
        src={src}
      />
      <p className="border-t border-white/10 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition group-hover:text-white">
        {label}
      </p>
    </a>
  );
}

async function readAuditResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Partial<AuditRecord> & { error?: string };
  }

  const text = await response.text();
  const compactText = text.replace(/\s+/g, " ").trim();
  const isHtml = compactText.startsWith("<!DOCTYPE") || compactText.startsWith("<html");

  throw new Error(
    isHtml
      ? "The scanner API returned an HTML error page. Check the dev server console and restart the app if needed."
      : compactText.slice(0, 240) || "The scanner API returned an unexpected response.",
  );
}

export default function Home() {
  const { t, locale } = useI18n();
  const [url, setUrl] = useState("https://example.com");
  const [status, setStatus] = useState<PageStatus>("idle");
  const [selectedCategory, setSelectedCategory] = useState<FilterValue>("All");
  const [activeStep, setActiveStep] = useState(0);
  const [auditReport, setAuditReport] = useState<AuditRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [copied, setCopied] = useState(false);

  const issueCategories = useMemo<FilterValue[]>(() => {
    if (!auditReport) return ["All"];
    const present = Array.from(new Set(auditReport.issues.map((i) => i.category)));
    return ["All", ...present];
  }, [auditReport]);

  const filteredIssues = useMemo(() => {
    if (!auditReport || selectedCategory === "All") {
      return auditReport?.issues ?? [];
    }
    return auditReport.issues.filter((issue) => issue.category === selectedCategory);
  }, [auditReport, selectedCategory]);

  const overall = auditReport?.scores.overall;
  const tier = typeof overall === "number" ? celestialTier(overall) : null;
  const isRunning = status === "running";

  const detailTabs: TabItem[] = [
    { id: "overview", label: t.tabs.overview },
    { id: "issues", label: t.tabs.issues, count: auditReport?.issues.length },
    { id: "screenshots", label: t.tabs.screenshots },
    { id: "metrics", label: t.tabs.metrics, count: auditReport?.metrics.length },
  ];

  async function runAudit() {
    if (isRunning) return;

    setStatus("running");
    setFormError("");
    setAuditReport(null);
    setSelectedCategory("All");
    setActiveTab("overview");
    setActiveStep(0);

    const stepTimer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, t.steps.length - 1));
    }, 900);

    try {
      const response = await fetch("/api/audits", {
        body: JSON.stringify({ url, language: locale }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readAuditResponse(response);

      if (!response.ok && !("status" in data)) {
        throw new Error(data.error ?? "The audit could not be completed.");
      }

      const report = data as AuditRecord;
      setAuditReport(report);
      setStatus(report.status === "failed" ? "failed" : "completed");

      if (report.status === "failed") {
        setFormError(report.error ?? "The audit could not be completed.");
      }
    } catch (error) {
      setStatus("failed");
      setFormError(
        error instanceof Error ? error.message : "The audit could not be completed.",
      );
    } finally {
      window.clearInterval(stepTimer);
      setActiveStep(t.steps.length - 1);
    }
  }

  function copyReportLink() {
    if (!auditReport) return;
    void navigator.clipboard.writeText(
      `${window.location.origin}/api/audits?id=${auditReport.id}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-16">
      {/* Header */}
      <header className="flex flex-col gap-4 py-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            {t.brand}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {t.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">{t.subtitle}</p>
        </div>
        <LanguageSwitcher />
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Audit form rail */}
        <aside className="h-fit">
          <GlassCard strong className="p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{t.newAudit}</h2>
                <p className="text-sm text-[var(--muted)]">{t.newAuditHint}</p>
              </div>
            </div>

            <form
              className="mt-4 space-y-5"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void runAudit();
              }}
            >
              <label className="block">
                <span className="text-sm font-medium text-[var(--muted-strong)]">
                  {t.urlLabel}
                </span>
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[var(--accent)]"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={t.urlPlaceholder}
                  type="url"
                  value={url}
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[var(--muted-strong)]">
                  {t.modulesTitle}{" "}
                  <span className="font-normal text-[var(--muted)]">· {t.modulesHint}</span>
                </legend>
                {t.modules.map((label) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--muted-strong)]"
                    key={label}
                  >
                    <span>{label}</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      On
                    </span>
                  </div>
                ))}
              </fieldset>

              {formError ? (
                <p
                  className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <button
                className="h-11 w-full rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(111,141,255,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRunning}
                type="submit"
              >
                {isRunning ? t.running : t.run}
              </button>
            </form>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-sm font-semibold text-white">{t.pipeline}</p>
              <ol className="mt-3 space-y-2">
                {t.steps.map((step, index) => {
                  const done =
                    status === "completed" ||
                    status === "failed" ||
                    (isRunning && index <= activeStep);
                  const current = isRunning && index === activeStep;
                  return (
                    <li className="flex items-center gap-2.5 text-sm" key={step}>
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full transition",
                          done ? "bg-[var(--accent-2)]" : "bg-white/15",
                          current && "ring-2 ring-[var(--accent-2)]/40",
                        )}
                        aria-hidden
                      />
                      <span className={done ? "text-[var(--muted-strong)]" : "text-[var(--muted)]"}>
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </GlassCard>
        </aside>

        {/* Report column */}
        <section className="space-y-5">
          <h2 className="sr-only">{t.resultsHeading}</h2>
          {/* Command Center hero */}
          <GlassCard strong className="overflow-hidden p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="flex items-center gap-5">
                <div className="relative h-48 w-48 shrink-0 sm:h-56 sm:w-56">
                  {status === "completed" && typeof overall === "number" ? (
                    <HealthOrbMount score={overall} />
                  ) : (
                    <OrbFallback score={0} color="#6f8dff" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    {t.overallHealth}
                  </p>
                  <p className="mt-1 text-5xl font-semibold tabular-nums text-white">
                    {typeof overall === "number" ? overall : "--"}
                    <span className="ml-1 text-lg font-normal text-[var(--muted)]">/100</span>
                  </p>
                  {tier ? (
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{ color: CELESTIAL_COLOR[tier] }}
                    >
                      {t.celestial[tier]}
                    </p>
                  ) : null}
                  <p className="mt-1 break-all text-sm text-[var(--muted)]">
                    {auditReport?.finalUrl ?? (isRunning ? t.scanning : url)}
                  </p>
                </div>
              </div>

              <div className="flex-1">
                {scoreBand(auditReport).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {scoreBand(auditReport).map((card) => (
                      <ScoreCard
                        key={card.key}
                        label={t.categories[card.catKey]}
                        value={card.value}
                        accent={card.accent}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
                    {isRunning ? t.scoresRunning : t.scoresIdle}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {auditReport ? (
                  <>
                    <span style={{ color: CATEGORY_ACCENT.Accessibility }}>●</span>{" "}
                    {t.statuses[auditReport.status]} · {auditReport.id}
                  </>
                ) : (
                  t.noAudit
                )}
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!auditReport}
                  onClick={copyReportLink}
                  type="button"
                >
                  {copied ? t.copied : t.copyLink}
                </button>
                <button
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-[var(--muted)] disabled:cursor-not-allowed"
                  disabled
                  title={t.exportPdfTitle}
                  type="button"
                >
                  {t.exportPdf}
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Tabbed detail area */}
          <GlassCard className="p-5">
            <Tabs
              tabs={detailTabs}
              active={activeTab}
              onChange={(id) => setActiveTab(id as DetailTab)}
              idPrefix="detail"
              label={t.resultsHeading}
            />

            <div className="mt-5">
              {/* Overview */}
              <section
                role="tabpanel"
                id="detail-panel-overview"
                aria-labelledby="detail-tab-overview"
                hidden={activeTab !== "overview"}
                tabIndex={0}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="text-sm font-semibold text-white">{t.summary}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                      {auditReport?.summary ?? t.summaryEmpty}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="text-sm font-semibold text-white">{t.nextAction}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                      {auditReport ? t.nextActionDone : t.nextActionIdle}
                    </p>
                  </div>
                </div>
              </section>

              {/* Issues */}
              <section
                role="tabpanel"
                id="detail-panel-issues"
                aria-labelledby="detail-tab-issues"
                hidden={activeTab !== "issues"}
                tabIndex={0}
              >
                <div className="flex flex-wrap gap-1.5">
                  {issueCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        selectedCategory === category
                          ? "bg-white/90 text-zinc-900"
                          : "border border-white/12 text-[var(--muted-strong)] hover:text-white",
                      )}
                    >
                      {category === "All" ? t.filterAll : t.categories[category]}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {!auditReport ? (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
                      {t.issuesEmpty}
                    </p>
                  ) : filteredIssues.length === 0 ? (
                    <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                      {t.issuesNone}
                    </p>
                  ) : (
                    filteredIssues.map((issue) => (
                      <article
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 lift"
                        key={issue.id}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <CategoryBadge
                                category={issue.category}
                                label={t.categories[issue.category]}
                              />
                              <SeverityBadge
                                severity={issue.severity}
                                label={t.severities[issue.severity]}
                              />
                            </div>
                            <h3 className="mt-3 text-base font-semibold text-white">
                              {issue.title}
                            </h3>
                          </div>
                          {issue.selector ? (
                            <code className="w-full shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-[var(--muted-strong)] md:w-auto md:max-w-[40%] md:truncate">
                              {issue.selector}
                            </code>
                          ) : null}
                        </div>
                        <p className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">
                          {issue.detail}
                        </p>
                        <p
                          className="mt-3 border-l-2 pl-3 text-sm leading-6 text-[var(--muted-strong)]"
                          style={{ borderColor: "var(--accent-2)" }}
                        >
                          {issue.fix}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              {/* Screenshots */}
              <section
                role="tabpanel"
                id="detail-panel-screenshots"
                aria-labelledby="detail-tab-screenshots"
                hidden={activeTab !== "screenshots"}
                tabIndex={0}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ScreenshotPanel
                    label={t.shotDesktop}
                    emptyLabel={t.awaitingScan}
                    src={auditReport?.screenshots.desktop}
                  />
                  <ScreenshotPanel
                    label={t.shotMobile}
                    emptyLabel={t.awaitingScan}
                    src={auditReport?.screenshots.mobile}
                  />
                </div>
              </section>

              {/* Metrics */}
              <section
                role="tabpanel"
                id="detail-panel-metrics"
                aria-labelledby="detail-tab-metrics"
                hidden={activeTab !== "metrics"}
                tabIndex={0}
              >
                {auditReport?.metrics.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {auditReport.metrics.map((metric) => (
                      <div
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                        key={metric.label}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[var(--muted-strong)]">
                            {metric.label}
                          </p>
                          <p className="text-sm font-semibold text-white">{metric.value}</p>
                        </div>
                        <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">
                          {metric.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
                    {t.metricsEmpty}
                  </p>
                )}
              </section>
            </div>
          </GlassCard>
        </section>
      </div>
    </main>
  );
}
