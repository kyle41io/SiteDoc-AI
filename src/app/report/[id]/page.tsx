import Link from "next/link";
import { notFound } from "next/navigation";
import { auditStore } from "@/lib/store";
import { isAuditId } from "@/lib/audit/id";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { ReportView } from "@/components/report/ReportView";
import { Sticker, WaveEdge } from "@/components/ui/decor";

// Reports are read from the store per request — never statically cached.
export const dynamic = "force-dynamic";

type ReportPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
};

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { id } = await params;
  const { print } = await searchParams;

  if (!isAuditId(id)) notFound();

  const record = await auditStore.get(id);
  if (!record || record.status !== "completed") notFound();

  // A shared report renders in the language it was created in, not the viewer's.
  const locale = isLocale(record.language) ? record.language : DEFAULT_LOCALE;
  const t = dictionaries[locale];
  const printMode = print === "1";

  const generatedOn = record.completedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
        new Date(record.completedAt),
      )
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
      <header className="py-7">
        <div className="pop-lg overflow-hidden rounded-[2rem]">
          <div className="sunburst relative px-5 pt-8 pb-12 text-center sm:px-9">
            <Sticker className="mb-5 bg-paper-2 px-5 py-2" tilt={-2}>
              <span className="eyebrow text-xs text-ink">
                {t.brand} · {t.report.sharedNote}
              </span>
            </Sticker>
            <h1
              className="headline headline-pop mx-auto max-w-3xl break-all text-[clamp(1.5rem,4.6vw,2.9rem)]"
              style={{ ["--stroke-w" as string]: "0.045em" }}
            >
              {record.finalUrl ?? record.url}
            </h1>
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
                  href={`/report/${record.id}/pdf`}
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
