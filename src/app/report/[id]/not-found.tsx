import Link from "next/link";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

// The shared report URL has no language context, so use the default locale.
const t = dictionaries[DEFAULT_LOCALE];

export default function ReportNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
        {t.brand}
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-white">{t.report.notFoundTitle}</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{t.report.notFoundBody}</p>
      <Link
        className="mt-6 rounded-xl bg-[var(--accent-strong)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        href="/"
      >
        {t.report.backToApp}
      </Link>
    </main>
  );
}
