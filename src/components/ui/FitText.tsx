"use client";

import { useEffect, useRef, type CSSProperties, type ElementType } from "react";
import { cn } from "@/lib/cn";
import { estimateTextWidthEm } from "@/lib/fit-text";

/** Binary-search steps: 7 halvings of a ~60px range land inside half a pixel. */
const STEPS = 7;
/** Slack on the pre-measurement estimate, so it never starts too big. */
const ESTIMATE_SAFETY = 0.95;

type FitTextProps = {
  /** Plain text: it gets measured, so no nested markup. */
  children: string;
  /** The design's intended size — any CSS length, `clamp()` included. */
  maxFontSize: string;
  /** Floor for the shrink. A single line clips with an ellipsis below it. */
  minFontSize: string;
  /**
   * Reserve a box this many lines of `maxFontSize` tall and wrap inside it.
   * Fractional values are fine. Omit it to keep the text on one line and fit
   * it to the width instead.
   */
  lines?: number;
  /** The text's line-height factor, needed to size the reserved box. */
  lineHeight?: number;
  as?: ElementType;
  /** Classes for the box: layout (width, margins, alignment). */
  className?: string;
  /**
   * Classes for the text itself: font, colour, weight. Typography belongs here
   * rather than on the box, because the fitted size lives on the text — an
   * outline or shadow measured in `em` only scales with it from here.
   */
  textClassName?: string;
  style?: CSSProperties;
  title?: string;
};

/**
 * Text that shrinks to fit the space it is given.
 *
 * Two uses, one mechanism:
 *
 * - **One line** (no `lines`): a URL always stays on a single line and gets
 *   smaller as it gets longer, instead of wrapping and wrecking the layout.
 * - **Reserved box** (`lines`): a headline is fitted into a box whose height
 *   depends only on `maxFontSize`, never on the text. That is what keeps the
 *   hero the same height in all five locales — a Vietnamese or Spanish title
 *   that would take a third line renders a little smaller instead of pushing
 *   everything below it down the page.
 *
 * The size is chosen by binary-searching the real rendered box, so it is exact
 * rather than a guess about glyph widths. Before that measurement can run (SSR,
 * the first paint, JavaScript disabled) the size comes from a CSS estimate
 * based on the character mix — close enough that the correction is not visible.
 *
 * The box takes whatever width it is given. Because it is a size-query
 * container it contributes *nothing* to its parent's intrinsic width, so put it
 * in a parent with a definite width — inside a flex or grid item that sizes to
 * its content, it collapses.
 */
export function FitText({
  children,
  maxFontSize,
  minFontSize,
  lines,
  lineHeight = 1,
  as,
  className,
  textClassName,
  style,
  title,
}: FitTextProps) {
  const boxRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const setSize = (value: string) => box.style.setProperty("--fit-size", value);
    /** Bounds are CSS lengths; only a real property resolves them to pixels. */
    const resolve = (bound: string) => {
      setSize(bound);
      return parseFloat(getComputedStyle(text).fontSize);
    };

    function fit() {
      if (!box || !text) return;
      const max = resolve("var(--fit-max)");
      const min = resolve("var(--fit-min)");
      // No layout to measure (jsdom, display:none): keep the CSS estimate.
      if (!max || !min || max <= min) return;

      const boxHeight = lines ? box.getBoundingClientRect().height : Infinity;
      const fits = () =>
        text.scrollWidth <= text.clientWidth + 1 &&
        text.getBoundingClientRect().height <= boxHeight + 1;

      setSize(`${max}px`);
      if (fits()) return;

      let tooSmall = min;
      let tooBig = max;
      for (let step = 0; step < STEPS; step += 1) {
        const mid = (tooSmall + tooBig) / 2;
        setSize(`${mid}px`);
        if (fits()) tooSmall = mid;
        else tooBig = mid;
      }
      setSize(`${Math.floor(tooSmall * 10) / 10}px`);
    }

    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };
    schedule();

    let observed = -1;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            // Only a width change can change the fit; the height changes are
            // our own doing, and reacting to them would loop.
            const width = entries[0]?.contentRect.width ?? -1;
            if (width === observed) return;
            observed = width;
            schedule();
          });
    observer?.observe(box);

    // Every advance width changes when a web font lands, so fit again once they
    // have. `fonts.ready` alone is not enough: fonts load lazily, so it can
    // resolve before the display face has even been requested — the event fires
    // after each batch actually finishes.
    const fonts: FontFaceSet | undefined = document.fonts;
    fonts?.addEventListener("loadingdone", schedule);
    let live = true;
    void fonts?.ready.then(() => {
      if (live) schedule();
    });

    return () => {
      live = false;
      fonts?.removeEventListener("loadingdone", schedule);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [children, lines, lineHeight, maxFontSize, minFontSize]);

  const Box = (as ?? "div") as ElementType;
  const budget = lines ? Math.floor(lines) : 1;
  const em = estimateTextWidthEm(children).toFixed(2);

  return (
    <Box
      className={cn("fit-text-box", className)}
      ref={boxRef}
      style={
        {
          ...style,
          "--fit-max": maxFontSize,
          "--fit-min": minFontSize,
          // Largest size whose estimated width still fits `budget` lines.
          "--fit-start": `clamp(var(--fit-min), calc(${budget} * ${ESTIMATE_SAFETY} * 100cqw / ${em}), var(--fit-max))`,
          containerType: "inline-size",
          // A grid with centred content keeps the text vertically centred in a
          // reserved box while still filling it, so `text-align` is inherited.
          display: "grid",
          alignContent: "center",
          ...(lines
            ? {
                height: `calc(${lines} * ${lineHeight} * var(--fit-max))`,
                // The reserved height is the point: never let text exceed it.
                overflow: "hidden",
              }
            : null),
        } as CSSProperties
      }
      title={title}
    >
      <span
        className={cn("block", !lines && "truncate", textClassName)}
        ref={textRef}
        style={{
          fontSize: "var(--fit-size, var(--fit-start))",
          // `truncate` is not enough on its own: it sets `white-space: nowrap`
          // from `@layer utilities`, which any unlayered `text-wrap` beats —
          // `.headline` sets `balance`. Inline, nothing outranks it.
          ...(lines ? null : { whiteSpace: "nowrap" as const }),
        }}
      >
        {children}
      </span>
    </Box>
  );
}
