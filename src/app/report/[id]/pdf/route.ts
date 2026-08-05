import { NextRequest, NextResponse } from "next/server";
import { renderReportPdf } from "@/lib/api/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each PDF launches a headless Chromium. The endpoint is public, so bound
// concurrent renders (1 on small hosts) so parallel requests can't exhaust
// memory; excess requests get a Retry-After instead of an OOM. On Lambda this
// becomes reserved concurrency on the function instead.
const MAX_CONCURRENT_PDF = Number(process.env.SITEDOC_MAX_CONCURRENT_PDF) || 1;
let pdfsInFlight = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (pdfsInFlight >= MAX_CONCURRENT_PDF) {
    return NextResponse.json(
      { error: "The PDF service is busy. Please retry shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  pdfsInFlight += 1;
  try {
    const baseUrl = `http://127.0.0.1:${process.env.PORT || "3000"}`;
    const result = await renderReportPdf({ id, baseUrl });

    if (!result.pdf) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sitedoc-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    pdfsInFlight -= 1;
  }
}
