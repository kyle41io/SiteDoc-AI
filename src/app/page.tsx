"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AuditIssue, AuditRecord } from "@/lib/audit-types";

type PageStatus = "idle" | "running" | "completed" | "failed";
type Category = AuditIssue["category"];

const categoryStyles: Record<Category, string> = {
  Accessibility: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SEO: "border-violet-200 bg-violet-50 text-violet-800",
  Performance: "border-amber-200 bg-amber-50 text-amber-800",
  UX: "border-indigo-200 bg-indigo-50 text-indigo-800",
  BestPractices: "border-teal-200 bg-teal-50 text-teal-800",
  Scanner: "border-zinc-200 bg-zinc-100 text-zinc-800",
  Console: "border-rose-200 bg-rose-50 text-rose-800",
  Network: "border-sky-200 bg-sky-50 text-sky-800",
};

const severityStyles: Record<AuditIssue["severity"], string> = {
  High: "bg-rose-100 text-rose-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-zinc-100 text-zinc-700",
};

const auditSteps = [
  "Validating public URL",
  "Launching isolated browser",
  "Capturing desktop screenshot",
  "Capturing mobile screenshot",
  "Saving audit artifacts",
];

const moduleOptions = [
  "URL safety validation",
  "Desktop screenshot",
  "Mobile screenshot",
  "Console and network capture",
];

function getScoreCards(report: AuditRecord | null) {
  return [
    {
      label: "Overall",
      value: report?.scores.overall,
      tone: "bg-zinc-950 text-white",
    },
    {
      label: "Scanner",
      value: report?.scores.scanner,
      tone: "bg-emerald-600 text-white",
    },
    {
      label: "Console",
      value: report?.scores.console,
      tone: "bg-rose-600 text-white",
    },
    {
      label: "Network",
      value: report?.scores.network,
      tone: "bg-sky-600 text-white",
    },
  ];
}

function ScreenshotPanel({
  label,
  src,
}: {
  label: string;
  src?: string;
}) {
  if (!src) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center border border-zinc-200 bg-[linear-gradient(135deg,#f4f4f5_25%,#ffffff_25%,#ffffff_50%,#f4f4f5_50%,#f4f4f5_75%,#ffffff_75%,#ffffff_100%)] bg-[length:20px_20px]">
        <span className="bg-white px-3 py-1 text-sm font-medium text-zinc-600">
          Awaiting scan
        </span>
      </div>
    );
  }

  return (
    <a
      className="group block border border-zinc-200 bg-zinc-50"
      href={src}
      rel="noreferrer"
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${label} screenshot`}
        className="aspect-[16/10] w-full object-cover object-top"
        src={src}
      />
      <p className="border-t border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition group-hover:text-zinc-950">
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
      ? "The scanner API returned an HTML error page. Check the local dev server console and restart the app if needed."
      : compactText.slice(0, 240) || "The scanner API returned an unexpected response.",
  );
}

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [status, setStatus] = useState<PageStatus>("idle");
  const [selectedCategory, setSelectedCategory] = useState<Category | "All">(
    "All",
  );
  const [activeStep, setActiveStep] = useState(0);
  const [auditReport, setAuditReport] = useState<AuditRecord | null>(null);
  const [formError, setFormError] = useState("");

  const filteredIssues = useMemo(() => {
    if (!auditReport || selectedCategory === "All") {
      return auditReport?.issues ?? [];
    }

    return auditReport.issues.filter((issue) => issue.category === selectedCategory);
  }, [auditReport, selectedCategory]);

  async function runAudit() {
    if (status === "running") {
      return;
    }

    setStatus("running");
    setFormError("");
    setAuditReport(null);
    setSelectedCategory("All");
    setActiveStep(0);

    const stepTimer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, auditSteps.length - 1));
    }, 900);

    try {
      const response = await fetch("/api/audits", {
        body: JSON.stringify({ url }),
        headers: {
          "Content-Type": "application/json",
        },
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
      setActiveStep(auditSteps.length - 1);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              SiteDoc AI
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950 md:text-4xl">
              Website QA reports your team can act on.
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">2</p>
              <p className="text-zinc-500">Viewports</p>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">Live</p>
              <p className="text-zinc-500">Browser</p>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">JSON</p>
              <p className="text-zinc-500">Saved</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[360px_1fr]">
        <aside className="h-fit border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold">New audit</h2>
              <p className="text-sm text-zinc-500">Scan a public page URL.</p>
            </div>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              Scanner
            </span>
          </div>

          <form
            className="mt-4 space-y-5"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void runAudit();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">
                Website URL
              </span>
              <input
                className="mt-2 h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-site.com"
                type="url"
                value={url}
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-zinc-700">
                Audit modules
              </legend>
              {moduleOptions.map((label) => (
                <label
                  className="flex items-center justify-between border border-zinc-200 px-3 py-2 text-sm"
                  key={label}
                >
                  <span>{label}</span>
                  <input
                    checked
                    className="h-4 w-4 accent-zinc-950"
                    readOnly
                    type="checkbox"
                  />
                </label>
              ))}
            </fieldset>

            {formError ? (
              <p className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {formError}
              </p>
            ) : null}

            <button
              className="h-11 w-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={status === "running"}
              onClick={() => void runAudit()}
              type="button"
            >
              {status === "running" ? "Running audit..." : "Run audit"}
            </button>
          </form>

          <div className="mt-5 border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-semibold">Scanner pipeline</p>
            <div className="mt-3 space-y-2">
              {auditSteps.map((step, index) => {
                const isDone =
                  status === "completed" ||
                  status === "failed" ||
                  (status === "running" && index <= activeStep);

                return (
                  <div
                    className="flex items-center gap-2 text-sm text-zinc-600"
                    key={step}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isDone ? "bg-emerald-600" : "bg-zinc-300"
                      }`}
                    />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Audit report</h2>
                <p className="mt-1 break-all text-sm text-zinc-500">
                  {auditReport?.finalUrl ?? url}
                </p>
                {auditReport ? (
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
                    {auditReport.status} / {auditReport.id}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:text-zinc-400"
                  disabled={!auditReport}
                  onClick={() => {
                    if (auditReport) {
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/api/audits?id=${auditReport.id}`,
                      );
                    }
                  }}
                  type="button"
                >
                  Copy JSON link
                </button>
                <button
                  className="border border-zinc-950 bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
                  disabled
                  title="PDF export will be added after report persistence is upgraded."
                  type="button"
                >
                  Export PDF
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {getScoreCards(auditReport).map((score) => (
                <div className="border border-zinc-200 bg-zinc-50" key={score.label}>
                  <div className={`px-4 py-3 ${score.tone}`}>
                    <p className="text-sm font-medium">{score.label}</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {score.value === undefined ? "--" : score.value}
                    </p>
                  </div>
                  <div className="h-1.5 bg-zinc-200">
                    <div
                      className="h-full bg-current transition-all"
                      style={{
                        width:
                          score.value === undefined ? "0%" : `${score.value}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div className="border border-zinc-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-lg font-semibold">Detected issues</h2>
                  <div className="flex flex-wrap gap-2">
                    {(["All", "Scanner", "Console", "Network"] as const).map(
                      (category) => (
                        <button
                          className={`border px-3 py-1.5 text-sm font-medium transition ${
                            selectedCategory === category
                              ? "border-zinc-950 bg-zinc-950 text-white"
                              : "border-zinc-300 bg-white hover:border-zinc-950"
                          }`}
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          type="button"
                        >
                          {category}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {!auditReport ? (
                    <p className="border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                      Run an audit to collect console errors, failed requests,
                      and screenshot artifacts.
                    </p>
                  ) : filteredIssues.length === 0 ? (
                    <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      No console or network issues were detected in this scan.
                    </p>
                  ) : (
                    filteredIssues.map((issue) => (
                      <article
                        className="border border-zinc-200 bg-zinc-50 p-4"
                        key={issue.id}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`border px-2 py-1 text-xs font-semibold ${categoryStyles[issue.category]}`}
                              >
                                {issue.category}
                              </span>
                              <span
                                className={`px-2 py-1 text-xs font-semibold ${severityStyles[issue.severity]}`}
                              >
                                {issue.severity}
                              </span>
                            </div>
                            <h3 className="mt-3 text-base font-semibold">
                              {issue.title}
                            </h3>
                          </div>
                          <code className="w-full border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 md:w-auto">
                            {issue.selector}
                          </code>
                        </div>
                        <p className="mt-3 break-words text-sm leading-6 text-zinc-600">
                          {issue.detail}
                        </p>
                        <p className="mt-3 border-l-2 border-emerald-600 pl-3 text-sm leading-6 text-zinc-800">
                          {issue.fix}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="border border-zinc-200 bg-white p-4">
                <h2 className="text-lg font-semibold">Screenshots</h2>
                <div className="mt-4 space-y-3">
                  <ScreenshotPanel
                    label="Desktop 1440px"
                    src={auditReport?.screenshots.desktop}
                  />
                  <ScreenshotPanel
                    label="Mobile 390px"
                    src={auditReport?.screenshots.mobile}
                  />
                </div>
              </div>

              <div className="border border-zinc-200 bg-white p-4">
                <h2 className="text-lg font-semibold">Scan metrics</h2>
                <div className="mt-4 space-y-3">
                  {auditReport?.metrics.length ? (
                    auditReport.metrics.map((metric) => (
                      <div className="border border-zinc-200 bg-zinc-50 p-3" key={metric.label}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{metric.label}</p>
                          <p className="text-sm font-semibold text-zinc-950">
                            {metric.value}
                          </p>
                        </div>
                        <p className="mt-2 break-words text-xs leading-5 text-zinc-500">
                          {metric.detail}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-zinc-600">
                      Run an audit to save scan timing, final URL, and browser
                      signal metrics.
                    </p>
                  )}
                </div>
              </div>

              <div className="border border-zinc-200 bg-white p-4">
                <h2 className="text-lg font-semibold">Scanner summary</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {auditReport?.summary ??
                    "Run an audit to generate a scanner summary from real browser signals."}
                </p>
                <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold">Next action</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {auditReport
                      ? "Use the screenshots, console errors, and failed request list as the input for accessibility, SEO, and AI remediation passes."
                      : "Start with a public URL that does not require login or private network access."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}
