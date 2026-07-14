import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { auditStore } from "@/lib/store";
import { isAuditId } from "@/lib/audit/id";
import { CHROMIUM_LAUNCH_OPTIONS } from "@/lib/chromium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each PDF launches a headless Chromium. The endpoint is public, so bound
// concurrent renders (1 on small hosts) so parallel requests can't exhaust
// memory; excess requests get a Retry-After instead of an OOM.
const MAX_CONCURRENT_PDF = Number(process.env.SITEDOC_MAX_CONCURRENT_PDF) || 1;
let pdfsInFlight = 0;

/**
 * Render the shared report to a downloadable PDF with the same Chromium the
 * scanner uses. We navigate to the print-optimized view over the **internal
 * loopback** (127.0.0.1:$PORT) — not the public origin — because hosts like
 * Render can't reliably reach their own external hostname from inside the
 * container. Screen media is kept so the dark design carries into the PDF.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isAuditId(id)) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  const record = await auditStore.get(id);
  if (!record || record.status !== "completed") {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  if (pdfsInFlight >= MAX_CONCURRENT_PDF) {
    return NextResponse.json(
      { error: "The PDF service is busy. Please retry shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  const port = process.env.PORT || "3000";
  const target = `http://127.0.0.1:${port}/report/${id}?print=1`;

  let browser;
  pdfsInFlight += 1;
  try {
    browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
    const page = await browser.newPage();
    await page.emulateMedia({ media: "screen" });
    await page.goto(target, { waitUntil: "networkidle", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16px", bottom: "16px", left: "16px", right: "16px" },
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sitedoc-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[pdf] generation failed:", error);
    return NextResponse.json({ error: "Could not generate the PDF report." }, { status: 500 });
  } finally {
    await browser?.close();
    pdfsInFlight -= 1;
  }
}
