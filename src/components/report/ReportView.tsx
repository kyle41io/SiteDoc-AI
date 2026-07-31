"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AuditCategory, AuditRecord } from "@/lib/audit-types";
import { buildImprovementPrompt } from "@/lib/audit/improvement-prompt";
import { CATEGORY_ACCENT } from "@/lib/audit/category-meta";
import { celestialTier, CELESTIAL_COLOR } from "@/lib/celestial";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";
import { PopCard } from "@/components/ui/PopCard";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CategoryBadge, SeverityBadge } from "@/components/ui/badges";
import { PlanetGrade, PlanetGradeEmpty } from "@/components/ui/PlanetGrade";

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

/** Cream inset used for the small explanatory blocks inside a panel. */
const INSET = "pop-sm rounded-2xl bg-paper-2 p-4";

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
  variant = "desktop",
}: {
  label: string;
  emptyLabel: string;
  src?: string;
  /**
   * Both captures are full-page, so they are previews rather than whole pages.
   * The desktop shot fills the frame; the mobile shot is only 390px wide, and
   * stretching it to the same width upscales it into a magnified sliver — so it
   * is scaled to the frame *height* instead and centred, reading as a phone
   * screen standing in the card. A very tall page would still collapse to a
   * hairline at that height, so it also claims a minimum 60% of the frame width
   * and crops the overflow instead of shrinking further.
   */
  variant?: "desktop" | "mobile";
}) {
  if (!src) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border-[3px] border-dashed border-line bg-paper-2">
        <span className="pop-sm rounded-full bg-paper px-4 py-1.5 text-sm font-bold text-ink-soft">
          {emptyLabel}
        </span>
      </div>
    );
  }
  return (
    <a
      className="pop-sm pop-lift group block overflow-hidden rounded-2xl bg-paper-2"
      href={src}
      rel="noreferrer"
      target="_blank"
    >
      <span className="flex aspect-[16/10] items-start justify-center overflow-hidden bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={label}
          className={cn(
            "object-top",
            variant === "mobile"
              ? "h-full w-auto min-w-[60%] max-w-full border-x-2 border-line object-cover"
              : "h-full w-full object-cover",
          )}
          src={src}
        />
      </span>
      <p className="border-t-2 border-line px-3 py-2 font-display text-sm uppercase tracking-wide text-ink">
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
          <p className="max-w-prose text-sm leading-6 text-ink-soft">{t.aiPrompt.intro}</p>
          <button
            type="button"
            onClick={handleCopy}
            aria-live="polite"
            className={cn(
              "btn-pop shrink-0 rounded-full px-4 py-2 font-display text-sm uppercase tracking-wide text-on-bright",
              copied ? "bg-mint" : "bg-lemon",
            )}
          >
            {copied ? `${t.aiPrompt.copied} ✓` : t.aiPrompt.copy}
          </button>
        </div>
      ) : null}
      <pre
        className={cn(
          "pop-sm mt-4 whitespace-pre-wrap break-words rounded-2xl bg-paper-2 p-4 font-mono text-xs leading-6 text-ink",
          // On screen the brief scrolls in a fixed well. On paper that well
          // clips it — the PDF used to stop at "# Issues to fix" — so print
          // lets it run at full height and flow across pages instead.
          !printMode && "scroll-pop max-h-[30rem] overflow-auto",
        )}
      >
        {prompt}
      </pre>
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <h4 className="eyebrow text-[0.7rem] text-on-bright">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2 text-sm font-semibold leading-6 text-on-bright">
            <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-on-bright" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
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
        <div className={INSET}>
          <h3 className="eyebrow text-[0.72rem] text-ink-soft">{t.summary}</h3>
          <p className="mt-2 text-sm leading-6 text-ink">{report?.summary ?? t.summaryEmpty}</p>
        </div>
        <div className={INSET}>
          <h3 className="eyebrow text-[0.72rem] text-ink-soft">{t.nextAction}</h3>
          <p className="mt-2 text-sm leading-6 text-ink">
            {report ? t.nextActionDone : t.nextActionIdle}
          </p>
        </div>
      </div>
      {report?.ai ? (
        <div className="pop-sm mt-4 rounded-2xl bg-grape p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg uppercase tracking-wide text-on-bright">
              {t.ai.heading}
            </h3>
            <span className="rounded-full border-2 border-line bg-paper-2 px-3 py-0.5 text-xs font-bold text-ink">
              {report.ai.source === "ai" ? t.ai.byAi : t.ai.heuristic}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-on-bright">
            {report.ai.executiveSummary}
          </p>
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
        <div className="flex flex-wrap gap-2">
          {issueCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              aria-pressed={selectedCategory === category}
              className={cn(
                "btn-pop rounded-full px-3 py-1 font-display text-xs uppercase tracking-wide",
                selectedCategory === category
                  ? "translate-x-[3px] translate-y-[3px] bg-ink text-paper shadow-none"
                  : "bg-paper-2 text-ink",
              )}
            >
              {category === "All" ? t.filterAll : t.categories[category]}
            </button>
          ))}
        </div>
      ) : null}

      <div className={cn("space-y-3", !printMode && "mt-4")}>
        {!report ? (
          <p className={cn(INSET, "text-sm text-ink-soft")}>{t.issuesEmpty}</p>
        ) : issuesToShow.length === 0 ? (
          <p className="pop-sm rounded-2xl bg-mint p-4 text-sm font-bold text-on-bright">
            {t.issuesNone}
          </p>
        ) : (
          issuesToShow.map((issue) => (
            <article className="pop-sm pop-break rounded-2xl bg-paper-2 p-4" key={issue.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={issue.category} label={t.categories[issue.category]} />
                    <SeverityBadge severity={issue.severity} label={t.severities[issue.severity]} />
                  </div>
                  <h3 className="mt-3 font-display text-lg leading-tight text-ink">{issue.title}</h3>
                </div>
                {issue.selector ? (
                  <code className="w-full shrink-0 rounded-lg border-2 border-line bg-paper px-2 py-1 font-mono text-xs text-ink md:w-auto md:max-w-[40%] md:truncate">
                    {issue.selector}
                  </code>
                ) : null}
              </div>
              {issue.detail ? (
                <p className="mt-3 break-words text-sm leading-6 text-ink-soft">{issue.detail}</p>
              ) : null}
              <p className="mt-3 rounded-xl border-2 border-line bg-aqua px-3 py-2 text-sm font-semibold leading-6 text-on-bright">
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
      <ScreenshotPanel
        label={t.shotMobile}
        emptyLabel={t.awaitingScan}
        src={report?.screenshots.mobile}
        variant="mobile"
      />
    </div>
  );

  const metricsContent = report?.metrics.length ? (
    <div className="grid gap-3 sm:grid-cols-2">
      {report.metrics.map((metric) => (
        <div className={cn(INSET, "pop-break")} key={metric.label}>
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow text-[0.7rem] text-ink-soft">{metric.label}</p>
            <p className="font-display text-base text-ink">{metric.value}</p>
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-ink-soft">{metric.detail}</p>
        </div>
      ))}
    </div>
  ) : (
    <p className={cn(INSET, "text-sm text-ink-soft")}>{t.metricsEmpty}</p>
  );

  const aiPromptContent = improvementPrompt ? (
    <AiPromptPanel prompt={improvementPrompt} t={t} printMode={printMode ?? false} />
  ) : (
    <p className={cn(INSET, "text-sm text-ink-soft")}>{t.aiPrompt.empty}</p>
  );

  return (
    <section className="space-y-6">
      <h2 className="sr-only">{t.resultsHeading}</h2>

      {/* Command Center hero */}
      <PopCard className="overflow-hidden p-5" tone="panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-col items-center gap-5 sm:flex-row lg:max-w-[46%]">
            {/* The orb sits in an inked porthole so it reads as a sticker. */}
            <div
              className="pop relative flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-52 sm:w-52"
              style={{ backgroundColor: "var(--hero-bg)" }}
            >
              {tier && isCompleted ? (
                <PlanetGrade label={t.celestial[tier]} tier={tier} />
              ) : (
                <PlanetGradeEmpty />
              )}
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <p className="eyebrow text-[0.72rem] text-ink-soft">{t.overallHealth}</p>
              <p className="font-display text-[3.6rem] leading-none text-ink tabular-nums">
                {typeof overall === "number" ? overall : "--"}
                <span className="ml-1 text-xl text-ink-soft">/100</span>
              </p>
              {tier ? (
                <span
                  className="mt-2 inline-block rounded-full border-2 border-line px-3 py-0.5 font-display text-sm uppercase tracking-wide text-on-bright"
                  style={{ backgroundColor: CELESTIAL_COLOR[tier] }}
                >
                  {t.celestial[tier]}
                </span>
              ) : null}
              <p
                className="mt-2 line-clamp-2 break-all font-mono text-xs text-ink-soft"
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
              <p className={cn(INSET, "text-sm text-ink-soft")}>
                {isRunning ? t.scoresRunning : t.scoresIdle}
              </p>
            )}
          </div>
        </div>

        {!printMode ? (
          <div className="mt-5 flex flex-col gap-3 border-t-[3px] border-dashed border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="eyebrow text-[0.68rem] text-ink-soft">
              {report ? (
                <>
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-line align-middle"
                    style={{ backgroundColor: CATEGORY_ACCENT.Accessibility }}
                  />
                  {t.statuses[report.status]} · {report.id}
                </>
              ) : (
                t.noAudit
              )}
            </p>
            {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
          </div>
        ) : null}
      </PopCard>

      {/* Detail area: tabbed when interactive, stacked when printing */}
      {printMode ? (
        <div className="space-y-5">
          {[
            { id: "overview", label: t.tabs.overview, content: overviewContent },
            { id: "issues", label: t.tabs.issues, content: issuesContent },
            { id: "screenshots", label: t.tabs.screenshots, content: screenshotsContent },
            { id: "metrics", label: t.tabs.metrics, content: metricsContent },
            { id: "aiPrompt", label: t.tabs.aiPrompt, content: aiPromptContent },
          ].map((s) => (
            <PopCard className="p-5" key={s.id} tone="panel">
              <h3 className="headline-flat mb-4 font-display text-xl uppercase tracking-wide">
                {s.label}
              </h3>
              {s.content}
            </PopCard>
          ))}
        </div>
      ) : (
        <PopCard className="p-5" tone="panel">
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
        </PopCard>
      )}
    </section>
  );
}
