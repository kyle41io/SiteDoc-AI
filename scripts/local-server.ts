/**
 * Local stand-in for the deployed edge. Two modes:
 *
 *   PORT=4000 tsx scripts/local-server.ts               → API only, next to `next dev`
 *   tsx scripts/local-server.ts --static out --port 3000 → API + the static export
 *
 * The second mode is the one the e2e suite drives: it approximates CloudFront's
 * routing table (static shell, /api/*, /pdf/*, /artifacts/*) closely enough to
 * catch routing mistakes before they reach AWS.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createAudit, getAudit } from "@/lib/api/audits";
import { renderReportPdf } from "@/lib/api/pdf";
import { artifactStore } from "@/lib/store";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function sendFile(res: http.ServerResponse, file: string, cacheControl: string) {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");

    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
      "content-length": info.size,
      "cache-control": cacheControl,
    });
    createReadStream(file).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

export function createLocalServer(options: { staticDir?: string }): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const { pathname } = url;

    try {
      if (pathname === "/api/audits" && req.method === "POST") {
        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          return sendJson(res, 400, { error: "Request body must be valid JSON." });
        }
        const input = (payload ?? {}) as { url?: unknown; language?: unknown };
        const result = await createAudit({ url: input.url, language: input.language });
        return sendJson(res, result.status, result.body);
      }

      if (pathname === "/api/audits" && req.method === "GET") {
        const result = await getAudit(url.searchParams.get("id"));
        return sendJson(res, result.status, result.body);
      }

      if (pathname.startsWith("/pdf/") && req.method === "GET") {
        const id = pathname.slice("/pdf/".length);
        const baseUrl = `http://127.0.0.1:${(req.socket.localPort ?? 3000).toString()}`;
        const result = await renderReportPdf({ id, baseUrl });

        if (!result.pdf) return sendJson(res, result.status, { error: result.error });

        res.writeHead(200, {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="sitedoc-${id}.pdf"`,
          "cache-control": "no-store",
          "content-length": result.pdf.byteLength,
        });
        return res.end(result.pdf);
      }

      // Screenshots. Mirrors the CloudFront `/artifacts/*` behavior.
      if (pathname.startsWith("/artifacts/")) {
        const [, , id, file] = pathname.split("/");
        if (!id || !file || file.includes("..")) {
          return sendJson(res, 400, { error: "Invalid artifact path." });
        }
        const dir = artifactStore.stagingDirectory(id);
        return sendFile(res, path.join(dir, file), "public, max-age=31536000, immutable");
      }

      if (options.staticDir) {
        const root = path.resolve(options.staticDir);
        // `/report/<id>` → the exported shell, mirroring the CloudFront Function.
        // Next exports the shell as `report.html`; `report/` holds only RSC
        // payloads, so this must not point at `report/index.html`.
        const rel = pathname.startsWith("/report/")
          ? "report.html"
          : pathname === "/"
            ? "index.html"
            : pathname.slice(1);
        const candidate = path.join(root, rel);
        const file = path.extname(candidate) ? candidate : path.join(candidate, "index.html");

        if (!file.startsWith(root)) return sendJson(res, 400, { error: "Invalid path." });

        return sendFile(res, file, "public, max-age=0, must-revalidate");
      }

      return sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      console.error("[local-server]", error);
      return sendJson(res, 500, { error: "Internal error." });
    }
  });
}

// Only start listening when run directly, so the test can import and control it.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = process.argv.slice(2);
  const staticIndex = args.indexOf("--static");
  const portIndex = args.indexOf("--port");
  const port = Number(
    portIndex >= 0 ? args[portIndex + 1] : (process.env.PORT ?? 4000),
  );
  const staticDir = staticIndex >= 0 ? (args[staticIndex + 1] ?? "out") : undefined;

  createLocalServer({ staticDir }).listen(port, () => {
    console.log(
      `[local-server] http://localhost:${port}${staticDir ? ` (static: ${staticDir})` : " (api only)"}`,
    );
  });
}
