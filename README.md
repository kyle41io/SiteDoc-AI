# SiteDoc AI

SiteDoc AI is an AI-assisted website QA dashboard for generating developer-ready audit reports across accessibility, performance, SEO, and UX quality.

The current version includes a real Playwright scanner: submit a public URL, launch Chromium, capture desktop and mobile screenshots, collect console errors and failed network requests, save local audit artifacts, and review the generated report in the dashboard.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- ESLint
- Playwright
- Vitest + Testing Library

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
```

The verification gate before completing a change is: `lint`, `typecheck`, `test`, `build`.

## MVP Features

- URL audit form (audit-module toggles are shown; selection wiring is planned)
- Public URL validation with local/private network blocking
- Playwright-powered desktop and mobile screenshot capture
- Browser console error collection
- Failed network request and HTTP 4xx/5xx collection
- Local JSON audit records under `.data/audits`
- Local screenshot artifacts under `public/audit-artifacts`
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

## Roadmap

The full phased roadmap and design (Aurora Glass 3D UI, accessibility/SEO/performance
engines, AI remediation, shareable reports, deployment) lives in
[`docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md`](docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md).

Near-term highlights:

- Aurora Glass design system + 3D site-health hero
- axe-core accessibility checks
- SEO + performance deterministic checks
- AI remediation reports from real audit data (with deterministic fallback)
- Shareable `/report/{id}` pages, persistence, and PDF export

## Local Artifact Storage

Scanner results are saved locally for MVP development:

```text
.data/audits/{auditId}.json
public/audit-artifacts/{auditId}/desktop.png
public/audit-artifacts/{auditId}/mobile.png
```

These paths are ignored by git. A production deployment should move audit records to PostgreSQL and screenshots to object storage.
