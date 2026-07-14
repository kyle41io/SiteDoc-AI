import Link from "next/link";
import { notFound } from "next/navigation";
import { auditStore } from "@/lib/store";
import { isAuditId } from "@/lib/audit/id";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { ReportView } from "@/components/report/ReportView";
import { AutoPrint } from "@/components/report/AutoPrint";

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
    <main className="mx-auto w-full max-w-5xl px-5 pb-16">
      <header className="flex flex-col gap-3 py-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            {t.brand} · {t.report.sharedNote}
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {record.finalUrl ?? record.url}
          </h1>
          {generatedOn ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t.report.generatedOn} {generatedOn}
            </p>
          ) : null}
        </div>

        {!printMode ? (
          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition hover:border-white/30 hover:text-white"
              href={`/report/${record.id}?print=1`}
              target="_blank"
              rel="noreferrer"
            >
              {t.report.downloadPdf}
            </a>
            <Link
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-[var(--muted-strong)] transition hover:border-white/30 hover:text-white"
              href="/"
            >
              {t.report.backToApp}
            </Link>
          </div>
        ) : null}
      </header>

      <ReportView report={record} t={t} printMode={printMode} />
      {printMode ? <AutoPrint /> : null}
    </main>
  );
}
