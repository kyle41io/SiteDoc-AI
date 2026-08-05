#!/usr/bin/env bash
# Deployment smoke test: drives one real audit through a deployed base URL and
# checks the behaviors from the migration spec's parity table that are verifiable
# from outside the app. The half that needs eyes — five locales, theme toggle,
# screenshots actually looking right — is a manual checklist, not this script.
#
# Usage: scripts/smoke-aws.sh https://dxxxxxxxx.cloudfront.net
set -euo pipefail

BASE="${1:-${SITEDOC_BASE_URL:-}}"
if [ -z "$BASE" ]; then
  echo "usage: scripts/smoke-aws.sh <base-url>" >&2
  exit 2
fi
BASE="${BASE%/}"
TARGET="${SMOKE_TARGET_URL:-https://example.com}"
TIMEOUT_S="${SMOKE_TIMEOUT_S:-240}"

command -v jq >/dev/null || { echo "smoke test needs jq" >&2; exit 2; }

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "  ok — $*"; }

code_of() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }

echo "Smoke testing $BASE"

# 1. The page path is pure S3 — no compute, no cold start.
[ "$(code_of "$BASE/")" = 200 ] || fail "GET / did not return 200"
ok "home page served"

# 2. An unknown path is a 404, not the exported shell. This also proves the
#    /report rewrite has not swallowed everything.
[ "$(code_of "$BASE/definitely-not-a-page")" = 404 ] || fail "unknown path did not 404"
ok "unknown path 404s"

# 3. The SSRF guard runs before anything is queued.
guard=$(code_of -X POST "$BASE/api/audits" -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1/","language":"en"}')
[ "$guard" = 400 ] || fail "SSRF guard returned $guard, expected 400"
ok "SSRF guard rejects loopback"

# 4. Create a real audit: 202 plus a queued record, exactly as on Render.
started=$SECONDS
created=$(curl -sS -X POST "$BASE/api/audits" -H 'content-type: application/json' \
  -d "$(jq -nc --arg url "$TARGET" '{url: $url, language: "en"}')")
id=$(jq -r '.id // empty' <<<"$created")
[ -n "$id" ] || fail "POST /api/audits returned no id: $created"
[ "$(jq -r .status <<<"$created")" = queued ] || fail "new audit was not queued: $created"
ok "audit $id queued"

# 5. Poll to completion. The first run of the day pays the container image pull,
#    which is the cold-start number worth recording.
while :; do
  record=$(curl -sS "$BASE/api/audits?id=$id")
  status=$(jq -r '.status // "?"' <<<"$record")
  case "$status" in
    completed) break ;;
    failed) fail "audit failed: $(jq -r '.error // .summary // ""' <<<"$record")" ;;
    queued | running) ;;
    *) fail "unexpected status '$status': $(head -c 200 <<<"$record")" ;;
  esac
  [ $((SECONDS - started)) -lt "$TIMEOUT_S" ] ||
    fail "audit still '$status' after ${TIMEOUT_S}s"
  sleep 5
done
elapsed=$((SECONDS - started))
ok "audit completed in ${elapsed}s"

# 6. Scores and the localized summary survived the store round-trip.
jq -e '.scores.overall | numbers' >/dev/null <<<"$record" || fail "no overall score"
jq -e '.summary | strings | length > 0' >/dev/null <<<"$record" || fail "no summary"
ok "scored $(jq -r .scores.overall <<<"$record")/100"

# 7. Both screenshots are reachable at the public /artifacts/ URL shape.
for viewport in desktop mobile; do
  path=$(jq -r --arg v "$viewport" '.screenshots[$v] // empty' <<<"$record")
  [ -n "$path" ] || fail "no $viewport screenshot on the record"
  headers=$(curl -sS -o /dev/null -D - "$BASE$path")
  grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" || fail "$viewport screenshot not 200"
  grep -qi 'content-type: image/png' <<<"$headers" || fail "$viewport is not a PNG"
  ok "$viewport screenshot served at $path"
done

# 8. The shareable link keeps its own URL through the edge rewrite.
[ "$(code_of "$BASE/report/$id")" = 200 ] || fail "/report/$id did not return 200"
ok "report page served at its own URL"

# 9. The PDF is a real PDF, rendered by the container function.
pdf=$(mktemp)
trap 'rm -f "$pdf"' EXIT
pdf_code=$(curl -sS -o "$pdf" -w '%{http_code}' "$BASE/pdf/$id")
[ "$pdf_code" = 200 ] || fail "GET /pdf/$id returned $pdf_code"
[ "$(head -c 4 "$pdf")" = "%PDF" ] || fail "/pdf/$id did not return a PDF"
ok "PDF downloaded ($(wc -c <"$pdf") bytes)"

# 10. A missing audit is a 404 from the API, not a 500 and not an HTML page.
[ "$(code_of "$BASE/api/audits?id=00000000-0000-4000-8000-000000000000")" = 404 ] ||
  fail "unknown audit id did not 404"
ok "unknown audit id 404s"

echo
echo "PASS — audit $id completed in ${elapsed}s"
echo "Record: $BASE/report/$id"
