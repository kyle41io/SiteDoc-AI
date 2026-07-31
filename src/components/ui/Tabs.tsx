"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number };

type TabsProps = {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Prefix for the generated tab/panel ids (must match the panels). */
  idPrefix: string;
  /** Accessible label for the tablist. */
  label: string;
};

/**
 * Accessible, controlled tablist (WAI-ARIA pattern): roving tabindex plus
 * Arrow/Home/End keyboard navigation. Panels are rendered by the parent with
 * `role="tabpanel"` and ids of `${idPrefix}-panel-${id}`.
 */
export function Tabs({ tabs, active, onChange, idPrefix, label }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2.5">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "btn-pop inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-sm uppercase tracking-wide",
              // The selected tab reads as "pressed in": travelled forward with
              // its shadow collapsed, so state survives without relying on hue.
              selected
                ? "translate-x-[3px] translate-y-[3px] bg-lemon text-on-bright shadow-none"
                : "bg-paper-2 text-ink",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "rounded-full border-2 border-line px-1.5 text-[10px] leading-4 tabular-nums",
                  selected ? "bg-paper-2 text-ink" : "bg-lemon text-on-bright",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
