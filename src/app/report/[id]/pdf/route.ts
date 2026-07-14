import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import { auditStore } from "@/lib/store";
import { isAuditId } from "@/lib/audit/id";
import { CHROMIUM_LAUNCH_OPTIONS } from "@/lib/chromium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each PDF cold-launches a headless Chromium (hundreds of MB). The endpoint is
// public, so bound concurrent renders to protect the server from being exhausted
// by parallel requests; excess requests get a Retry-After instead of an OOM.
const MAX_CONCURRENT_PDF = 2;
let pdfsInFlight = 0;

/**
 * Render the shared report page to a downloadable PDF using the same Chromium
 * dependency the scanner uses. We navigate to `/report/[id]?print=1` (which
 * swaps the animated orb for a static score and stacks all sections) and keep
 * screen media so the dark design carries into the PDF.
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

  const target = new URL(`/report/${id}?print=1`, request.nextUrl.origin).toString();

  let browser;
  pdfsInFlight += 1;
  try {
    browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
    const page = await browser.newPage();
    await page.emulateMedia({ media: "screen" });
    await page.goto(target, { waitUntil: "networkidle", timeout: 30_000 });
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
