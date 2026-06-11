import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  /** Use the more opaque/blurred surface. */
  strong?: boolean;
  /** Add the hover-lift interaction (for clickable cards). */
  interactive?: boolean;
};

/** Frosted-glass surface card — the core Aurora Glass building block. */
export function GlassCard({
  children,
  className,
  strong,
  interactive,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-2xl",
        interactive && "lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
