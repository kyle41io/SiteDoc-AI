import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Surface fills available to a card. `panel` is the brightest sheet. */
export type PopTone = "paper" | "panel" | "sky" | "lemon" | "mint" | "grape" | "coral";

const TONE_CLASS: Record<PopTone, string> = {
  paper: "bg-paper-2 text-ink",
  panel: "bg-panel text-ink",
  sky: "bg-sky text-on-bright",
  lemon: "bg-lemon text-on-bright",
  mint: "bg-mint text-on-bright",
  grape: "bg-grape text-on-bright",
  coral: "bg-coral text-on-bright",
};

const DEPTH_CLASS = {
  sm: "pop-sm rounded-2xl",
  md: "pop rounded-[1.4rem]",
  lg: "pop-lg rounded-[1.75rem]",
} as const;

type PopCardProps = {
  children: ReactNode;
  className?: string;
  /** Surface fill. Bright tones always pair with the fixed `on-bright` ink. */
  tone?: PopTone;
  /** Outline weight + hard-shadow offset. */
  depth?: keyof typeof DEPTH_CLASS;
  /** Add the press-in hover interaction (for clickable cards). */
  interactive?: boolean;
};

/**
 * Outlined, hard-shadowed surface — the core Pop Sheet building block.
 * Everything from the hero to a single issue row is one of these.
 */
export function PopCard({
  children,
  className,
  tone = "panel",
  depth = "md",
  interactive,
}: PopCardProps) {
  return (
    <div
      className={cn(
        DEPTH_CLASS[depth],
        TONE_CLASS[tone],
        "pop-break",
        interactive && "pop-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
