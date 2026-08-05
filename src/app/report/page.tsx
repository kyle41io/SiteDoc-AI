import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportClient } from "@/components/report/ReportClient";

/**
 * Shared report links get a generic card, not a per-report one: the page is
 * statically exported and the record is fetched in the browser, so there is no
 * build-time knowledge of any individual audit.
 */
export const metadata: Metadata = {
  title: "SiteDoc AI — Website audit report",
  description: "Accessibility, SEO, performance and UX findings for an audited page.",
  openGraph: {
    title: "SiteDoc AI — Website audit report",
    description: "Accessibility, SEO, performance and UX findings for an audited page.",
    images: ["/og-report.png"],
  },
};

export default function ReportPage() {
  // `useSearchParams` in the client child requires a Suspense boundary.
  return (
    <Suspense fallback={<main className="min-h-[60vh]" aria-busy="true" />}>
      <ReportClient />
    </Suspense>
  );
}
