// Viewer-request function, attached to the /report/* and /artifacts/* behaviors.
// This runs on the CloudFront JS 2.0 runtime, not Node — no imports, no modules.
//
// Two rewrites, both structural:
//  - /report/<id> -> /report.html. A dynamic segment cannot be statically
//    exported, so one exported shell serves every report and fetches its own
//    record. Next writes that shell to `report.html`; `report/` holds only RSC
//    payloads, so pointing at /report/index.html returns the wrong bytes.
//  - /artifacts/<id>/<file> -> /audits/<id>/<file>. The scan worker writes S3
//    keys under `audits/`, while the public URL says `artifacts/`. `origin_path`
//    cannot express this: CloudFront prepends it, so it would produce
//    /audits/artifacts/<id>/<file>.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.startsWith("/report/")) {
    request.uri = "/report.html";
  } else if (uri.startsWith("/artifacts/")) {
    request.uri = "/audits/" + uri.slice("/artifacts/".length);
  }

  return request;
}
