"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { AuditRecord } from "@/lib/audit-types";
import { apiUrl } from "@/lib/api-base";
import { isAuditId } from "@/lib/audit/id";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { ReportView } from "@/components/report/ReportView";
import { NotFoundPanel } from "@/components/ui/NotFoundPanel";
import { FitText } from "@/components/ui/FitText";
import { Sticker, WaveEdge } from "@/components/ui/decor";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "loaded"; record: AuditRecord };

export function ReportClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const id = pathname.split("/").filter(Boolean).at(-1) ?? "";
  // Derived, not stored: a malformed id is knowable at render time, and setting
  // state for it inside the effect would cause a cascading render.
  const validId = isAuditId(id);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!validId) return;

    let active = true;

    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/audits?id=${encodeURIComponent(id)}`));
        if (!active) return;

        if (!res.ok) return setState({ kind: "missing" });

        const record = (await res.json()) as AuditRecord;
        if (!active) return;

        setState(
          record.status === "completed" ? { kind: "loaded", record } : { kind: "missing" },
        );
      } catch {
        if (active) setState({ kind: "missing" });
      }
    })();

    return () => {
      active = false;
    };
  }, [id, validId]);

  if (!validId || state.kind === "missing") {
    return (
      <div data-report-missing="true">
        <NotFoundPanel variant="report" />
      </div>
    );
  }

  if (state.kind === "loading") {
    // Deliberately unstyled-but-sized: the PDF renderer keys off
    // `data-report-ready`, so this must never claim readiness.
    return <main className="mx-auto min-h-[60vh] w-full max-w-5xl px-4 py-20" aria-busy="true" />;
  }

  const { record } = state;
  // A shared report renders in the language it was created in, not the viewer's.
  const locale = isLocale(record.language) ? record.language : DEFAULT_LOCALE;
  const t = dictionaries[locale];
  const generatedOn = record.completedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
        new Date(record.completedAt),
      )
    : null;

  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6"
      data-report-ready="true"
    >
      <header className="py-7">
        <div className="pop-lg overflow-hidden rounded-[2rem]">
          <div className="sunburst relative px-5 pt-8 pb-12 text-center sm:px-9">
            <Sticker className="mb-5 bg-paper-2 px-5 py-2" tilt={-2}>
              <span className="eyebrow text-xs text-ink">
                {t.brand} · {t.report.sharedNote}
              </span>
            </Sticker>
            {/* The audited URL, always on one line: it shrinks to fit instead of
                breaking mid-token across two or three lines. */}
            <FitText
              as="h1"
              className="mx-auto max-w-4xl"
              maxFontSize="clamp(1.5rem, 4.6vw, 2.9rem)"
              minFontSize="0.85rem"
              style={{ ["--stroke-w" as string]: "0.045em" }}
              textClassName="headline headline-pop"
              title={record.finalUrl ?? record.url}
            >
              {record.finalUrl ?? record.url}
            </FitText>
            <WaveEdge className="absolute inset-x-0 bottom-0" fill="var(--paper-2)" />
          </div>

          <div className="flex flex-col items-center justify-between gap-3 bg-paper-2 px-5 pb-6 sm:flex-row sm:px-9">
            {generatedOn ? (
              <p className="eyebrow text-[0.7rem] text-ink-soft">
                {t.report.generatedOn} {generatedOn}
              </p>
            ) : (
              <span />
            )}

            {!printMode ? (
              <div className="no-print flex flex-wrap justify-center gap-2.5">
                <a
                  className="btn-pop inline-flex items-center rounded-full bg-lemon px-4 py-2 font-display text-sm uppercase tracking-wide text-on-bright"
                  href={`/pdf/${record.id}`}
                >
                  {t.report.downloadPdf}
                </a>
                <Link
                  className="btn-pop inline-flex items-center rounded-full bg-panel px-4 py-2 font-display text-sm uppercase tracking-wide text-ink"
                  href="/"
                >
                  {t.report.backToApp}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <ReportView report={record} t={t} printMode={printMode} />
    </main>
  );
}
