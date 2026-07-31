"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { Sticker } from "@/components/ui/decor";

/**
 * Shared body for both 404 boundaries.
 *
 * This is a client component so the copy follows the reader's language.
 * `LanguageProvider` resolves the locale after mount and stamps it on
 * `<html lang>`, so rendering static English here would leave the markup
 * claiming e.g. `lang="vi"` over English text.
 */
export function NotFoundPanel({ variant }: { variant: "page" | "report" }) {
  const { t } = useI18n();
  const isReport = variant === "report";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-24 text-center">
      <Sticker
        className={isReport ? "h-24 w-24 bg-coral" : "h-24 w-24 bg-sky"}
        tilt={isReport ? -9 : 7}
      >
        <span className="font-display text-4xl leading-none text-on-bright">404</span>
      </Sticker>
      <p className="eyebrow mt-6 text-xs text-ink-soft">{t.brand}</p>
      <h1 className="headline headline-flat mt-2 text-4xl">
        {isReport ? t.report.notFoundTitle : t.pageNotFound.title}
      </h1>
      <p className="mt-3 max-w-md text-base leading-7 text-ink-soft">
        {isReport ? t.report.notFoundBody : t.pageNotFound.body}
      </p>
      <Link
        className="btn-pop mt-7 inline-flex items-center rounded-full bg-lemon px-6 py-3 font-display text-base uppercase tracking-wide text-on-bright"
        href="/"
      >
        {t.report.backToApp}
      </Link>
    </main>
  );
}
