<!-- The YAML block below configures a Hugging Face Docker Space (ignored elsewhere). -->
---
title: SiteDoc AI
emoji: 🛰️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 3000
pinned: false
---

# SiteDoc AI

SiteDoc AI is an AI-assisted website QA dashboard for generating developer-ready audit reports across accessibility, performance, SEO, and UX quality. It features an "Aurora Glass" UI with a score-driven 3D celestial hero (the better the score, the grander the body — Moon → … → Galaxy) and is available in 5 languages.

The current version includes a real Playwright scanner: submit a public URL, launch Chromium, capture desktop and mobile screenshots, collect console errors and failed network requests, save local audit artifacts, and review the generated report in the dashboard.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- three.js / react-three-fiber (3D hero)
- ESLint
- Playwright
- Vitest + Testing Library

## Internationalization

The UI, the deterministic audit content (summaries, issue titles/fixes, metrics), **and the AI remediation report** are localized in **English, Vietnamese, Spanish, Chinese, and Japanese** via a header language switcher. The chosen language is sent with each audit and stored on the report, so AI-generated feedback is produced in the page's language. See `src/i18n/`.

## AI Remediation Layer

Completed audits are enriched with an AI-generated remediation report — an executive summary, prioritized issues, recommended actions, and UX suggestions — produced in the page's language. AI is accessed only through the `@/lib/ai` provider abstraction, which selects a provider by whichever API key is present:

- **Claude** (`ANTHROPIC_API_KEY`, preferred): default model `claude-opus-4-8` (override `SITEDOC_AI_MODEL`), via a forced structured-output tool call.
- **OpenAI** (`OPENAI_API_KEY`, used when no Anthropic key is set): default model `gpt-4o-mini` (override `SITEDOC_OPENAI_MODEL`), via Structured Outputs.
- **Deterministic fallback** (no key, or any error/timeout): a report built from the audit data and localized templates, so a report is always returned and the audit never blocks.

Copy `.env.example` to `.env.local` to configure. All variables are optional.

## Shareable Reports & PDF Export

Every completed audit gets a server-rendered, read-only page at **`/report/{id}`** that
renders in the language the audit was created in (independent of the viewer's language
switcher). From the dashboard, **Copy link** / **Open report** share it; from the report
page, **Download PDF** generates a one-click PDF by rendering the report in print mode
through the same Playwright/Chromium dependency the scanner uses. Reports are read from
the `AuditStore`, so a database-backed store will make them durable across deploys without
any change to these pages.

## Getting Started

> **Requires Node 20+** (Next.js 16). If your shell defaults to an older Node, run `nvm use 20`.

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
npm run dev        # start the dev server
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest (unit/component)
npm run test:watch # Vitest in watch mode
npm run build      # production build (also type-checks)
npm run start      # serve the production build
npm run test:e2e   # Playwright end-to-end smoke test (boots the built app)
```

The verification gate before completing a change is: `lint`, `typecheck`, `test`, `build`.

## MVP Features

- URL audit form (audit-module toggles are shown; selection wiring is planned)
- Public URL validation with local/private network blocking
- Playwright-powered desktop and mobile screenshot capture
- Browser console error collection
- Failed network request and HTTP 4xx/5xx collection
- Local JSON audit records under `.data/audits`
- Local screenshot artifacts under `.data/audit-artifacts` (served via an API route)
- Scanner, console, network, and overall scorecards
- Categorized issue list with severity labels and remediation guidance
- Responsive dashboard layout

## Project Structure

```text
src/app/                 Routes + API (App Router)
src/lib/audit-types.ts   Core audit data model
src/lib/audit/scoring.ts Pure scoring helpers (unit-tested)
src/lib/playwright-scanner.ts  Playwright scan orchestration
src/lib/url-validation.ts      SSRF guard for public URLs
src/lib/store/           AuditStore interface + local FS implementation
```

Storage is accessed only through the `AuditStore` abstraction (`@/lib/store`), so a
database-backed implementation can be swapped in later without touching callers.

## Credits

Planet/Sun surface textures (`public/textures/planets/`) are by James Hastings-Trew
(Planet Pixel Emporium, free for any use), obtained via the MIT-licensed
`threex.planets` project. See `public/textures/planets/CREDITS.md`.

## Roadmap

The full phased roadmap and design (Aurora Glass 3D UI, accessibility/SEO/performance
engines, AI remediation, shareable reports, deployment) lives in
[`docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md`](docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md).

Shipped: Aurora Glass design system + 3D celestial hero · **axe-core accessibility engine** · **deterministic SEO + performance checks** (categorized, scored, localized) · **AI remediation layer** (Claude or OpenAI + deterministic fallback, localized) · **shareable `/report/{id}` pages + one-click PDF export** · **async job model + durable SQLite store + containerized deploy + CI/E2E** · 5-language i18n.

Upcoming:

- Object storage for screenshots and a managed database for multi-instance scale

## Async Audit Jobs

Submitting a URL returns immediately (`202`) with a `queued` record; the Playwright scan
and AI enrichment run in a background queue (bounded concurrency, default 2), and the UI
polls `GET /api/audits?id=` through `queued → running → completed`. This keeps requests
fast and decouples the heavy work from the response.

## Storage

Audit records are accessed only through the `AuditStore` abstraction:

- **Local JSON** (default): `.data/audits/{auditId}.json`.
- **SQLite** (`AUDIT_STORE=sqlite`): a durable `.data/sitedoc.db` that survives restarts —
  the default inside the container image.

Screenshots are written to `.data/audit-artifacts/{auditId}/{desktop,mobile}.png` and
served by the `/api/artifacts/[id]/[file]` route (not from `public/`, which `next start`
only serves for files present at build time). All `.data` paths are git-ignored. For
multi-instance scale, move screenshots to object storage and point `AuditStore` at a
managed database.

## Deployment

Playwright needs a full Chromium, which doesn't fit serverless functions, so the app ships
as a **container** built on the official Playwright image (Chromium preinstalled):

```bash
docker build -t sitedoc-ai .

# OPENAI_API_KEY is optional (AI falls back deterministically without it).
# Mount both volumes to persist audits AND their screenshots across restarts.
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -v sitedoc-data:/app/.data \
  sitedoc-ai
```

The image defaults to `AUDIT_STORE=sqlite`. Audit **records and screenshots** both live
under `/app/.data`, so the single volume above persists everything across restarts.
(Screenshots are served by the `/api/artifacts/[id]/[file]` route — not from `public/` —
because `next start` won't serve files written there after build.) For multi-instance
scale, move screenshots to object storage and point `AuditStore` at a managed database.

It runs on any container host (Railway, Render, Fly.io, a VM). CI (`.github/workflows/ci.yml`)
runs lint, typecheck, unit tests, build, and the Playwright E2E on every push/PR.
