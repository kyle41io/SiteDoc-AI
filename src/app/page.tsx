"use client";

import { FormEvent, useId, useState } from "react";
import type { AuditRecord } from "@/lib/audit-types";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/provider";
import { PopCard } from "@/components/ui/PopCard";
import { Sticker, Ticker, WaveEdge } from "@/components/ui/decor";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ReportView } from "@/components/report/ReportView";

/** Rotating chip fills, so the module list reads as a sticker sheet. */
const CHIP_TONES = ["bg-mint", "bg-lemon", "bg-bubblegum", "bg-aqua", "bg-grape"];

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
 * Poll the audit record until it reaches a terminal state. The POST now returns
 * a `queued` record immediately and the scan runs in the background, so the UI
 * watches `GET ?id=` for `completed`/`failed`. Transient blips (server restart,
 * non-JSON) are tolerated; gives up after `timeoutMs`.
 */
async function pollAudit(id: string, timeoutMs = 120_000): Promise<AuditRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(1500);
    try {
      const res = await fetch(`/api/audits?id=${encodeURIComponent(id)}`);
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      if (res.ok && isJson) {
        const record = (await res.json()) as AuditRecord;
        if (record.status === "completed" || record.status === "failed") {
          return record;
        }
      }
    } catch {
      // Transient network/server blip — keep polling until the deadline.
    }
  }
  throw new Error("The audit timed out. Please try again.");
}

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
  const urlFieldId = useId();
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

      // POST returns a queued record; poll until the background job finishes.
      const queued = data as AuditRecord;
      const report = await pollAudit(queued.id);
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

  // No colour utility here: `cn` is a plain joiner, so each variant below must
  // emit exactly one fill and exactly one text colour or they fight in the cascade.
  const actionClass =
    "btn-pop inline-flex items-center rounded-full px-4 py-2 font-display text-sm uppercase tracking-wide";

  const reportActions = (
    <>
      <button
        className={cn(actionClass, copied ? "bg-mint text-on-bright" : "bg-paper-2 text-ink")}
        disabled={!auditReport}
        onClick={copyReportLink}
        type="button"
      >
        {copied ? t.copied : t.copyLink}
      </button>
      {auditReport ? (
        <a
          className={cn(actionClass, "bg-lemon text-on-bright")}
          href={`/report/${auditReport.id}`}
          rel="noreferrer"
          target="_blank"
        >
          {t.report.openReport}
        </a>
      ) : (
        <button className={cn(actionClass, "bg-paper-2 text-ink")} disabled type="button">
          {t.report.openReport}
        </button>
      )}
    </>
  );

  return (
    <main className="pb-20">
      {/* Masthead */}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3">
            <Sticker className="h-12 w-12 bg-lemon" tilt={-10}>
              <span className="font-display text-lg leading-none text-on-bright">SD</span>
            </Sticker>
            <p className="font-display text-2xl uppercase leading-none tracking-tight text-ink">
              {t.brand}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
      </div>

      {/* Hero: sunburst sky over a cream apron holding the scan form */}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section className="pop-lg overflow-hidden rounded-[2rem]">
          <div className="sunburst relative px-5 pt-10 pb-14 text-center sm:px-10 sm:pt-14">
            <Sticker className="mb-6 bg-paper-2 px-5 py-2" tilt={-2}>
              <span className="eyebrow text-xs text-ink sm:text-sm">
                {t.newAudit} · {t.newAuditHint}
              </span>
            </Sticker>
            <h1
              className="headline headline-pop mx-auto max-w-4xl text-[clamp(2.1rem,7.4vw,4.6rem)]"
              style={{ ["--stroke-w" as string]: "0.05em" }}
            >
              {t.title}
            </h1>
            <WaveEdge className="absolute inset-x-0 bottom-0" fill="var(--paper-2)" />
          </div>

          <div className="bg-paper-2 px-5 pb-8 sm:px-10">
            <p className="mx-auto max-w-3xl text-center text-base leading-7 text-ink-soft">
              {t.subtitle}
            </p>

            <form
              className="mx-auto mt-6 max-w-3xl"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void runAudit();
              }}
            >
              <label className="eyebrow block text-[0.7rem] text-ink-soft" htmlFor={urlFieldId}>
                {t.urlLabel}
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  className="field-pop h-14 w-full rounded-full px-5 font-mono text-sm sm:flex-1"
                  id={urlFieldId}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={t.urlPlaceholder}
                  type="url"
                  value={url}
                />
                <button
                  className="btn-pop h-14 shrink-0 rounded-full bg-lemon px-8 font-display text-lg uppercase tracking-wide text-on-bright"
                  disabled={isRunning}
                  type="submit"
                >
                  {isRunning ? t.running : t.run}
                </button>
              </div>

              {formError ? (
                <p
                  className="pop-sm mt-4 rounded-2xl bg-coral px-4 py-3 text-sm font-bold text-on-bright"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <fieldset className="mt-5">
                <legend className="eyebrow text-[0.7rem] text-ink-soft">
                  {t.modulesTitle} · {t.modulesHint}
                </legend>
                <ul className="mt-2.5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {t.modules.map((label, index) => (
                    <li
                      className={cn(
                        "pop-sm inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold text-on-bright",
                        CHIP_TONES[index % CHIP_TONES.length],
                      )}
                      key={label}
                    >
                      <span aria-hidden>✓</span>
                      {label}
                    </li>
                  ))}
                </ul>
              </fieldset>
            </form>
          </div>
        </section>
      </div>

      {/* Full-bleed marquee */}
      <Ticker className="mt-10 bg-ink text-paper" items={t.ticker} />
      <Ticker
        className="bg-lemon text-on-bright"
        durationSeconds={44}
        items={t.ticker}
        reverse
      />

      <div className="mx-auto mt-10 w-full max-w-6xl space-y-6 px-4 sm:px-6">
        {/* Scanner pipeline stepper */}
        <PopCard className="p-5" tone="panel">
          <h2 className="eyebrow text-[0.72rem] text-ink-soft">{t.pipeline}</h2>
          <ol className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {t.steps.map((step, index) => {
              const done =
                status === "completed" ||
                status === "failed" ||
                (isRunning && index <= activeStep);
              const current = isRunning && index === activeStep;
              return (
                <li
                  className={cn(
                    "pop-sm flex items-start gap-2.5 rounded-2xl px-3 py-2.5 transition-colors",
                    current
                      ? "bg-lemon text-on-bright"
                      : done
                        ? "bg-mint text-on-bright"
                        : "bg-paper-2 text-ink-soft",
                  )}
                  key={step}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line bg-paper-2 font-display text-xs text-ink"
                  >
                    {done && !current ? "✓" : index + 1}
                  </span>
                  <span className="text-sm font-bold leading-5">{step}</span>
                </li>
              );
            })}
          </ol>
        </PopCard>

        {/* Report */}
        <ReportView
          report={auditReport}
          t={t}
          isRunning={isRunning}
          fallbackUrl={url}
          actions={reportActions}
        />
      </div>
    </main>
  );
}
