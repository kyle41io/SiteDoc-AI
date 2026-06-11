"use client";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{t.language}</span>
      <span aria-hidden className="text-[var(--muted)]" title={t.language}>
        {/* globe glyph */}
        🌐
      </span>
      <select
        aria-label={t.language}
        className="glass rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted-strong)] outline-none transition focus:border-[var(--accent)]"
        onChange={(event) => setLocale(event.target.value as Locale)}
        value={locale}
      >
        {LOCALES.map((code) => (
          <option className="bg-[var(--background-soft)] text-white" key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
