"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Language switcher built as a WAI-ARIA listbox rather than a native `<select>`,
 * so the open menu matches the Aurora Glass design (a native select's popup is
 * drawn by the OS and can't be styled). The trigger owns focus; the open list
 * uses `aria-activedescendant` with roving highlight and full keyboard support
 * (Arrow/Home/End to move, Enter/Space to choose, Escape to close).
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => LOCALES.indexOf(locale));

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Move focus into the list once it opens (a DOM sync, not derived state).
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openMenu() {
    setActiveIndex(LOCALES.indexOf(locale));
    setOpen(true);
  }

  // Close the list and, unless the pointer already moved focus elsewhere,
  // return focus to the trigger so keyboard/screen-reader users keep their
  // place (matching the native <select> this replaces).
  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(index: number) {
    setLocale(LOCALES[index]);
    close(true);
  }

  function onTriggerClick() {
    if (open) setOpen(false);
    else openMenu();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % LOCALES.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + LOCALES.length) % LOCALES.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(LOCALES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        // Let Tab move focus onward naturally, but from the trigger (the list
        // is about to unmount) so a single Tab lands on the next control.
        close(true);
        break;
      default:
        return;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.language}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
        className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted-strong)] outline-none transition hover:text-white focus-visible:border-[var(--accent)]"
      >
        <span aria-hidden className="text-[var(--muted)]">
          🌐
        </span>
        <span>{LOCALE_LABELS[locale]}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cn("h-3.5 w-3.5 text-[var(--muted)] transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={t.language}
          aria-activedescendant={optionId(activeIndex)}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="glass-menu absolute right-0 z-50 mt-2 min-w-[10rem] overflow-hidden rounded-xl p-1 shadow-[0_20px_50px_rgba(0,0,0,0.55)] outline-none"
        >
          {LOCALES.map((code, index) => {
            const selected = code === locale;
            const active = index === activeIndex;
            return (
              <li
                key={code}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onClick={() => choose(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-white/10 text-white" : "text-[var(--muted-strong)]",
                )}
              >
                <span>{LOCALE_LABELS[code]}</span>
                {selected ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className="h-4 w-4 text-[var(--accent)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="m5 10.5 3.5 3.5L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
