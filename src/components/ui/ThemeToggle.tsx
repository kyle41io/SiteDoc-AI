"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/cn";

/**
 * Chunky sliding light/dark switch. Rendered as a real `switch` so the state
 * is announced, with the knob travelling between a sun and a moon face.
 */
export function ThemeToggle() {
  const { theme, toggleTheme, ready } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`${t.theme.label}: ${isDark ? t.theme.dark : t.theme.light}`}
      onClick={toggleTheme}
      title={isDark ? t.theme.light : t.theme.dark}
      className="btn-pop relative inline-flex h-11 w-[4.75rem] shrink-0 items-center rounded-full bg-paper-2 px-1"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-2.5 text-[13px] leading-none"
      >
        <span className={cn("transition-opacity", isDark && "opacity-35")}>☀️</span>
        <span className={cn("transition-opacity", !isDark && "opacity-35")}>🌙</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-8 w-8 rounded-full border-[3px] border-line",
          // Skip the slide on the very first paint so a dark-mode reload
          // doesn't animate the knob across from the light position.
          ready ? "transition-transform duration-200 ease-out" : "",
          // One fill per branch — appending a second `bg-*` would resolve by
          // stylesheet order, not argument order (`cn` is a plain joiner).
          isDark ? "translate-x-[2.15rem] bg-grape" : "bg-lemon",
        )}
      />
    </button>
  );
}
