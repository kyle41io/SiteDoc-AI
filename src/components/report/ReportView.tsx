"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AuditCategory, AuditRecord } from "@/lib/audit-types";
import { buildImprovementPrompt } from "@/lib/audit/improvement-prompt";
import { CATEGORY_ACCENT } from "@/lib/audit/category-meta";
import { celestialTier, CELESTIAL_COLOR } from "@/lib/celestial";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CategoryBadge, SeverityBadge } from "@/components/ui/badges";
import { HealthOrbMount, OrbFallback } from "@/components/three/HealthOrbMount";

type FilterValue = AuditCategory | "All";
type DetailTab = "overview" | "issues" | "screenshots" | "metrics" | "aiPrompt";

export type ReportViewProps = {
  /** The report to render, or null for the dashboard's idle/running state. */
  report: AuditRecord | null;
  /** Localized strings (the dashboard's live locale, or the report's stored locale). */
  t: Dictionary;
  /** Dashboard-only: a scan is in progress (drives placeholder copy). */
  isRunning?: boolean;
  /** URL to show before a finalUrl exists (dashboard input / report URL). */
  fallbackUrl?: string;
  /** Buttons rendered in the hero footer (copy/open on dashboard, download on report page). */
  actions?: ReactNode;
  /** Print layout for PDF rendering: no tabs, no orb, all sections stacked, no actions. */
  printMode?: boolean;
};

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

function ScreenshotPanel({ label, emptyLabel, src }: { label: string; emptyLabel: string; src?: string }) {
  if (!src) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03]">
        <span className="rounded-md bg-white/10 px-3 py-1 text-sm text-[var(--muted)]">{emptyLabel}</span>
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
      <img alt={label} className="aspect-[16/10] w-full object-cover object-top" src={src} />
      <p className="border-t border-white/10 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition group-hover:text-white">
        {label}
      </p>
    </a>
  );
}

/**
 * "AI Fix Prompt" panel: an explainer + copy button over the deterministic
 * improvement brief. The copy control is hidden in print mode (a static PDF
 * can't copy), where the brief just renders as text.
 */
function AiPromptPanel({ prompt, t, printMode }: { prompt: string; t: Dictionary; printMode: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (insecure context); the text stays selectable.
    }
  }

  return (
    <div>
      {!printMode ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-prose text-sm leading-6 text-[var(--muted-strong)]">{t.aiPrompt.intro}</p>
          <button
            type="button"
            onClick={handleCopy}
            aria-live="polite"
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition lift",
              copied
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/15 bg-white/[0.04] text-[var(--muted-strong)] hover:border-white/30 hover:text-white",
            )}
          >
            {copied ? `${t.aiPrompt.copied} ✓` : t.aiPrompt.copy}
          </button>
        </div>
      ) : null}
      <pre className="mt-4 max-h-[30rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-6 text-[var(--muted-strong)]">
        {prompt}
      </pre>
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-6 text-[var(--muted-strong)]">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Static score disc used in print mode instead of the animated WebGL orb. */
function StaticScore({ score, color }: { score: number; color: string }) {
  return (
    <div
      className="flex h-40 w-40 items-center justify-center rounded-full"
      style={{ border: `4px solid ${color}`, color }}
    >
      <span className="text-4xl font-semibold tabular-nums">{score}</span>
    </div>
  );
}

export function ReportView({ report, t, isRunning = false, fallbackUrl, actions, printMode = false }: ReportViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<FilterValue>("All");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const issueCategories = useMemo<FilterValue[]>(() => {
    if (!report) return ["All"];
    return ["All", ...Array.from(new Set(report.issues.map((i) => i.category)))];
  }, [report]);

  const filteredIssues = useMemo(() => {
    if (!report || selectedCategory === "All") return report?.issues ?? [];
    return report.issues.filter((issue) => issue.category === selectedCategory);
  }, [report, selectedCategory]);

  const overall = report?.scores.overall;
  const isCompleted = report?.status === "completed" && typeof overall === "number";
  const tier = typeof overall === "number" ? celestialTier(overall) : null;
  const bands = scoreBand(report);

  const improvementPrompt = useMemo(
    () => (report?.status === "completed" ? buildImprovementPrompt(report, t) : ""),
    [report, t],
  );

  const detailTabs: TabItem[] = [
    { id: "overview", label: t.tabs.overview },
    { id: "issues", label: t.tabs.issues, count: report?.issues.length },
    { id: "screenshots", label: t.tabs.screenshots },
    { id: "metrics", label: t.tabs.metrics, count: report?.metrics.length },
    { id: "aiPrompt", label: t.tabs.aiPrompt },
  ];

  const issuesToShow = printMode ? report?.issues ?? [] : filteredIssues;

  const overviewContent = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white">{t.summary}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{report?.summary ?? t.summaryEmpty}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-semibold text-white">{t.nextAction}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
            {report ? t.nextActionDone : t.nextActionIdle}
          </p>
        </div>
      </div>
      {report?.ai ? (
        <div className="mt-4 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">{t.ai.heading}</h3>
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[var(--muted-strong)]">
              {report.ai.source === "ai" ? t.ai.byAi : t.ai.heuristic}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{report.ai.executiveSummary}</p>
          {report.ai.topIssues.length > 0 ? <AiList title={t.ai.topIssues} items={report.ai.topIssues} /> : null}
          {report.ai.recommendations.length > 0 ? (
            <AiList title={t.ai.recommendations} items={report.ai.recommendations} />
          ) : null}
          {report.ai.uxSuggestions && report.ai.uxSuggestions.length > 0 ? (
            <AiList title={t.ai.uxSuggestions} items={report.ai.uxSuggestions} />
          ) : null}
        </div>
      ) : null}
    </>
  );

  const issuesContent = (
    <>
      {!printMode ? (
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
      ) : null}

      <div className={cn("space-y-3", !printMode && "mt-4")}>
        {!report ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
            {t.issuesEmpty}
          </p>
        ) : issuesToShow.length === 0 ? (
          <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {t.issuesNone}
          </p>
        ) : (
          issuesToShow.map((issue) => (
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4 lift" key={issue.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={issue.category} label={t.categories[issue.category]} />
                    <SeverityBadge severity={issue.severity} label={t.severities[issue.severity]} />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">{issue.title}</h3>
                </div>
                {issue.selector ? (
                  <code className="w-full shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-[var(--muted-strong)] md:w-auto md:max-w-[40%] md:truncate">
                    {issue.selector}
                  </code>
                ) : null}
              </div>
              {issue.detail ? (
                <p className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">{issue.detail}</p>
              ) : null}
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
    </>
  );

  const screenshotsContent = (
    <div className="grid gap-4 sm:grid-cols-2">
      <ScreenshotPanel label={t.shotDesktop} emptyLabel={t.awaitingScan} src={report?.screenshots.desktop} />
      <ScreenshotPanel label={t.shotMobile} emptyLabel={t.awaitingScan} src={report?.screenshots.mobile} />
    </div>
  );

  const metricsContent = report?.metrics.length ? (
    <div className="grid gap-3 sm:grid-cols-2">
      {report.metrics.map((metric) => (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" key={metric.label}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--muted-strong)]">{metric.label}</p>
            <p className="text-sm font-semibold text-white">{metric.value}</p>
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">{metric.detail}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
      {t.metricsEmpty}
    </p>
  );

  const aiPromptContent = improvementPrompt ? (
    <AiPromptPanel prompt={improvementPrompt} t={t} printMode={printMode ?? false} />
  ) : (
    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
      {t.aiPrompt.empty}
    </p>
  );

  return (
    <section className="space-y-5">
      <h2 className="sr-only">{t.resultsHeading}</h2>

      {/* Command Center hero */}
      <GlassCard strong className="overflow-hidden p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-5 lg:max-w-[46%]">
            <div className="relative flex h-48 w-48 shrink-0 items-center justify-center sm:h-56 sm:w-56">
              {printMode ? (
                <StaticScore
                  score={typeof overall === "number" ? overall : 0}
                  color={tier ? CELESTIAL_COLOR[tier] : "#6f8dff"}
                />
              ) : isCompleted ? (
                <HealthOrbMount score={overall} />
              ) : (
                <OrbFallback score={0} color="#6f8dff" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                {t.overallHealth}
              </p>
              <p className="mt-1 text-5xl font-semibold tabular-nums text-white">
                {typeof overall === "number" ? overall : "--"}
                <span className="ml-1 text-lg font-normal text-[var(--muted)]">/100</span>
              </p>
              {tier ? (
                <p className="mt-1 text-sm font-semibold" style={{ color: CELESTIAL_COLOR[tier] }}>
                  {t.celestial[tier]}
                </p>
              ) : null}
              <p
                className="mt-1 line-clamp-2 break-all text-sm text-[var(--muted)]"
                title={report?.finalUrl ?? fallbackUrl}
              >
                {report?.finalUrl ?? (isRunning ? t.scanning : fallbackUrl)}
              </p>
            </div>
          </div>

          <div className="flex-1">
            {bands.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {bands.map((card) => (
                  <ScoreCard key={card.key} label={t.categories[card.catKey]} value={card.value} accent={card.accent} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-[var(--muted)]">
                {isRunning ? t.scoresRunning : t.scoresIdle}
              </p>
            )}
          </div>
        </div>

        {!printMode ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              {report ? (
                <>
                  <span style={{ color: CATEGORY_ACCENT.Accessibility }}>●</span> {t.statuses[report.status]} ·{" "}
                  {report.id}
                </>
              ) : (
                t.noAudit
              )}
            </p>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        ) : null}
      </GlassCard>

      {/* Detail area: tabbed when interactive, stacked when printing */}
      {printMode ? (
        <div className="space-y-5">
          {[
            { id: "overview", label: t.tabs.overview, content: overviewContent },
            { id: "issues", label: t.tabs.issues, content: issuesContent },
            { id: "screenshots", label: t.tabs.screenshots, content: screenshotsContent },
            { id: "metrics", label: t.tabs.metrics, content: metricsContent },
          ].map((s) => (
            <GlassCard className="p-5" key={s.id}>
              <h3 className="mb-4 text-base font-semibold text-white">{s.label}</h3>
              {s.content}
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="p-5">
          <Tabs
            tabs={detailTabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as DetailTab)}
            idPrefix="detail"
            label={t.resultsHeading}
          />
          <div className="mt-5">
            <section role="tabpanel" id="detail-panel-overview" aria-labelledby="detail-tab-overview" hidden={activeTab !== "overview"} tabIndex={0}>
              {overviewContent}
            </section>
            <section role="tabpanel" id="detail-panel-issues" aria-labelledby="detail-tab-issues" hidden={activeTab !== "issues"} tabIndex={0}>
              {issuesContent}
            </section>
            <section role="tabpanel" id="detail-panel-screenshots" aria-labelledby="detail-tab-screenshots" hidden={activeTab !== "screenshots"} tabIndex={0}>
              {screenshotsContent}
            </section>
            <section role="tabpanel" id="detail-panel-metrics" aria-labelledby="detail-tab-metrics" hidden={activeTab !== "metrics"} tabIndex={0}>
              {metricsContent}
            </section>
            <section role="tabpanel" id="detail-panel-aiPrompt" aria-labelledby="detail-tab-aiPrompt" hidden={activeTab !== "aiPrompt"} tabIndex={0}>
              {aiPromptContent}
            </section>
          </div>
        </GlassCard>
      )}
    </section>
  );
}
