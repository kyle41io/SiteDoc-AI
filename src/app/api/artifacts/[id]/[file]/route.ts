import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAuditId } from "@/lib/audit/id";
import { getAuditArtifactDirectory } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only these filenames may be served — a fixed allowlist that also blocks any
// path-traversal attempt via the `file` segment.
const ALLOWED_FILES = new Set(["desktop.png", "mobile.png"]);

/**
 * Serves audit screenshots from `.data/audit-artifacts/{id}/`. Needed because
 * `next start` does not serve files written to `public/` after build time —
 * runtime screenshots would 404. The id is UUID-validated and the filename is
 * allowlisted before any disk read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;

  if (!isAuditId(id) || !ALLOWED_FILES.has(file)) {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }

  try {
    const bytes = await readFile(path.join(getAuditArtifactDirectory(id), file));
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
}
