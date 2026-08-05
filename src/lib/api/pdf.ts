import { chromium } from "playwright";
import { auditStore } from "@/lib/store";
import { isAuditId } from "@/lib/audit/id";
import { CHROMIUM_LAUNCH_OPTIONS } from "@/lib/chromium";

/**
 * A4 at 96dpi in CSS pixels, and the margin used below. Chromium lays the
 * printed document out in `paper width − horizontal margins`, so the window has
 * to be exactly that wide: text that measures itself (the fitted URL headline)
 * is sized while the page is on screen, and from a 1280px window it comes out
 * too big for the paper and gets clipped.
 */
export const PDF_MARGIN_PX = 16;
export const PDF_WIDTH_PX = 794 - PDF_MARGIN_PX * 2;

export type PdfResult = {
  status: number;
  /**
   * Backed by a plain `ArrayBuffer` (not `ArrayBufferLike`) so it satisfies
   * `BodyInit` when a caller hands it straight to a `Response`.
   */
  pdf?: Uint8Array<ArrayBuffer>;
  error?: string;
};

/**
 * Render the shared report to a PDF with the same Chromium the scanner uses.
 *
 * `baseUrl` is injected rather than derived: in production it is the CloudFront
 * domain (reachable from Lambda), and in local development it is the local
 * server. Screen media is kept so the design carries into the PDF.
 */
export async function renderReportPdf(input: {
  id: string;
  baseUrl: string;
}): Promise<PdfResult> {
  const { id, baseUrl } = input;

  if (!isAuditId(id)) return { status: 400, error: "Invalid report id." };

  const record = await auditStore.get(id);
  if (!record || record.status !== "completed") {
    return { status: 404, error: "Report not found." };
  }

  const target = `${baseUrl.replace(/\/$/, "")}/report/${id}?print=1`;

  let browser;
  try {
    browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
    const page = await browser.newPage({
      viewport: { width: PDF_WIDTH_PX, height: 1123 },
    });
    await page.emulateMedia({ media: "screen" });
    await page.goto(target, { waitUntil: "networkidle", timeout: 45_000 });

    // The report fetches its own record, so "network is idle" can mean "the
    // skeleton finished rendering". Wait for the page to say it is ready.
    await page.waitForSelector("[data-report-ready='true']", { timeout: 30_000 });

    // Self-measuring text re-fits once the display font lands, a frame later.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.fonts.ready.then(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }),
    );

    const margin = `${PDF_MARGIN_PX}px`;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
    });

    return { status: 200, pdf: new Uint8Array(pdf) };
  } catch (error) {
    console.error("[pdf] generation failed:", error);
    return { status: 500, error: "Could not generate the PDF report." };
  } finally {
    await browser?.close();
  }
}
