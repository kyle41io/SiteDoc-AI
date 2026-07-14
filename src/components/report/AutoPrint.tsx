"use client";

import { useEffect } from "react";

/**
 * Opens the browser's print dialog once the print view has rendered. Rendered
 * only on `/report/[id]?print=1`, so the "Download PDF" link (which opens that
 * URL) results in a one-step "Save as PDF" — no server-side Chromium needed,
 * which is essential on small hosts (e.g. Render's 512 MB free tier).
 */
export function AutoPrint() {
  useEffect(() => {
    // Small delay so fonts/layout settle before the dialog captures the page.
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
