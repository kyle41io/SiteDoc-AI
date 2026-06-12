"use client";

import { FormEvent, useState } from "react";
import type { AuditRecord } from "@/lib/audit-types";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";
import { GlassCard } from "@/components/ui/GlassCard";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ReportView } from "@/components/report/ReportView";

type PageStatus = "idle" | "running" | "completed" | "failed";

/**
 * Raised when the scanner endpoint is briefly unreachable — e.g. the dev server
 * is recompiling or a devcontainer port-forwarder serves its own HTML/5xx page
 * in the gap. These are retryable; the route handler itself always returns JSON.
 */
class TransientScannerError extends Error {}

async function readAuditResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Partial<AuditRecord> & { error?: string };
  }

  // 502/503/504 from a proxy mean "not ready yet", regardless of body shape.
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new TransientScannerError("The scanner is starting up — retrying.");
  }

  const text = await response.text();
  const compactText = text.replace(/\s+/g, " ").trim();
  const isHtml = compactText.startsWith("<!DOCTYPE") || compactText.startsWith("<html");

  if (isHtml) {
    // An HTML body on an API route means the request never reached our handler
    // (server down/restarting). Treat as transient so callers can retry.
    throw new TransientScannerError("The scanner is restarting — retrying.");
  }

  throw new Error(
    compactText.slice(0, 240) || "The scanner API returned an unexpected response.",
  );
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * POST an audit, retrying transient unavailability (server restart / network
 * blip) a few times with backoff before surfacing a hard failure to the user.
 */
async function postAudit(body: { url: string; language: string }, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch("/api/audits", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await readAuditResponse(response);
      return { response, data };
    } catch (error) {
      // `TypeError` is what fetch throws when the connection is refused/dropped.
      const transient =
        error instanceof TransientScannerError || error instanceof TypeError;
      if (transient && attempt < attempts) {
        await wait(1000 * attempt);
        continue;
      }
      if (error instanceof TransientScannerError) {
        throw new Error(
          "The scanner is unavailable after several attempts. Make sure the app server is running, then try again.",
        );
      }
      throw error;
    }
  }
}

export default function Home() {
  const { t, locale } = useI18n();
  const [url, setUrl] = useState("https://example.com");
  const [status, setStatus] = useState<PageStatus>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [auditReport, setAuditReport] = useState<AuditRecord | null>(null);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);

  const isRunning = status === "running";

  async function runAudit() {
    if (isRunning) return;

    setStatus("running");
    setFormError("");
    setAuditReport(null);
    setActiveStep(0);

    const stepTimer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, t.steps.length - 1));
    }, 900);

    try {
      const { response, data } = await postAudit({ url, language: locale });

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
      `${window.location.origin}/report/${auditReport.id}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const reportActions = (
    <>
      <button
        className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!auditReport}
        onClick={copyReportLink}
        type="button"
      >
        {copied ? t.copied : t.copyLink}
      </button>
      {auditReport ? (
        <a
          className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition hover:border-white/30 hover:text-white"
          href={`/report/${auditReport.id}`}
          rel="noreferrer"
          target="_blank"
        >
          {t.report.openReport}
        </a>
      ) : (
        <button
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-[var(--muted)] disabled:cursor-not-allowed"
          disabled
          type="button"
        >
          {t.report.openReport}
        </button>
      )}
    </>
  );

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
        <ReportView report={auditReport} t={t} isRunning={isRunning} fallbackUrl={url} actions={reportActions} />
      </div>
    </main>
  );
}
