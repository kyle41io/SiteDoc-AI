---
name: react-nextjs-development
description: "Project-specific React/Next.js guidance for SiteDoc AI — Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, and Playwright. Use for any frontend, API route, audit-pipeline, testing, or deployment work in this repo."
category: project-workflow
risk: safe
source: adapted-from-antigravity-awesome-skills
date_added: "2026-02-27"
date_revised: "2026-06-11"
---

# SiteDoc AI — React/Next.js Development

Concrete, project-specific conventions for building SiteDoc AI. This is not a
generic tutorial: follow the patterns below so the codebase stays consistent.

> Read `AGENTS.md` (source of truth) and the roadmap spec in
> `docs/superpowers/specs/` before starting feature work.

## Verified Stack (this repo)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.x**, App Router, Turbopack | Server Components by default |
| Runtime | **Node 20+** | The container default `node` is 18; `nvm use 20` |
| Language | **TypeScript 5**, `strict` | `@/*` → `src/*` path alias |
| UI | **React 19** | Use `use client` only when a component needs interactivity |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) | Design system = "Aurora Glass" (see below) |
| 3D | **react-three-fiber** (hero only), CSS-3D elsewhere | Dynamic import, SSR-safe, respects reduced motion |
| Browser automation | **Playwright** (`chromium`) | Runs in the Node server runtime, not Edge |
| Tests | **Vitest** + Testing Library (`jsdom`) | E2E via Playwright later |
| Lint | **ESLint 9** flat config (`eslint-config-next`) | |

## Architecture & Conventions

- **Directory layout** (target): `src/app` (routes + API), `src/components`
  (`ui/`, `three/`, `report/`), `src/lib/audit` (scanner, checks, scoring),
  `src/lib/ai` (provider abstraction + fallback), `src/lib/store` (storage
  abstraction). Keep files focused; split when a file grows past one job.
- **Server Components by default.** Add `"use client"` only for components with
  state, effects, refs, browser APIs, or event handlers. Keep client bundles
  small; push data work to the server.
- **API routes** that use Playwright/Node APIs must set
  `export const runtime = "nodejs"`. Never assume the Edge runtime.
- **Storage goes through `@/lib/store`** (`AuditStore` interface). Never read or
  write audit JSON directly from a route or component — call `auditStore`.
  Screenshot paths come from `getAuditArtifactUrl` / `getAuditArtifactDirectory`.
- **AI goes through `@/lib/ai`** (provider abstraction) and must always have a
  deterministic fallback. AI augments deterministic checks; it is never the only
  analyzer and must never block a report from rendering.
- **Pure logic is extracted and tested** (e.g. `lib/audit/scoring.ts`,
  `lib/url-validation.ts`). Don't bury testable logic inside the scanner or a
  React component.
- **Security: untrusted URLs.** All scanned URLs pass `validatePublicHttpUrl`
  (SSRF guard). Do not weaken the private-network / credential / protocol
  checks. Per-request guarding uses `createRequestSafetyGuard`.

## Design System: "Aurora Glass" (+ a11y is a feature)

- Dark, premium feel: frosted-glass panels (`backdrop-blur`) layered over an
  aurora gradient-mesh background; subtle hover tilt/parallax. Mostly CSS-3D.
- A signature **react-three-fiber "site-health orb"** is the only heavy 3D, used
  for the hero/score band. Load it dynamically and render a static fallback.
- **We audit accessibility, so our own UI must pass it.** Honor
  `prefers-reduced-motion` (disable orb spin / parallax), keep AA contrast, full
  keyboard navigation, semantic HTML, and visible focus states. Treat an
  inaccessible UI as a bug, not a polish item.
- Report layout is a **hybrid**: a Command Center hero band (orb + overall +
  category scores) on top, then a tabbed/filtered detail area below.

## Audit Pipeline Conventions

- Deterministic analyzers live in `src/lib/audit/checks/` and return typed
  `AuditIssue[]` with `category`, `severity`, `title`, `detail`, `fix`, and
  (when relevant) `selector`, `helpUrl`, `impact`.
- Scores are `0-100`, per category, on `AuditScores`. Keep penalties capped and
  scores floored so a single noisy signal can't zero a score.
- Accessibility uses axe-core injected into the page; SEO/performance use
  deterministic DOM + timing checks. Combine them with the AI explanation layer.

## Testing

- **TDD for pure logic** (scoring, validation, checks, AI fallback, store):
  write the failing test first.
- Co-locate tests as `*.test.ts(x)` next to the unit. Run with `npm test`.
- Component tests use Testing Library; prefer role/text queries over test ids.
- Make stores/analyzers configurable (e.g. `LocalAuditStore(baseDir)`) so tests
  use throwaway directories and never touch real `.data/`.

## Verification Gate (run before announcing a feature)

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Then do a `code-reviewer` pass. **Do not commit** — announce the completed
feature and let the maintainer review and commit (project rule).

## Deployment Notes

- Playwright + Chromium does **not** run on Vercel's default serverless/Edge
  runtime. Plan for `@sparticuz/chromium` or a separate worker host; move
  screenshots to object storage and audit records to a database (behind the
  existing `AuditStore` interface) before deploying.

## Limitations

- Use this skill only for work inside the SiteDoc AI repo and its stack.
- It does not replace running the verification gate or expert review.
- Stop and ask if requirements, permissions, or success criteria are unclear.
