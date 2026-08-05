import { NextRequest, NextResponse } from "next/server";
import { createAudit, getAudit } from "@/lib/api/audits";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = (payload ?? {}) as { url?: unknown; language?: unknown };
  const { status, body } = await createAudit({ url: input.url, language: input.language });

  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  const { status, body } = await getAudit(request.nextUrl.searchParams.get("id"));

  return NextResponse.json(body, { status });
}
