# SiteDoc AI — Full Roadmap & Design Spec

**Date:** 2026-06-11
**Status:** Approved direction, pending user review of this spec
**Author:** Claude (brainstorming session with @kyle41io)

---

## 1. Goal

Turn SiteDoc AI from an MVP scanner into a production-quality, CV-grade **AI website QA platform**: paste a public URL → get a developer-ready audit report covering **accessibility, SEO, performance, UX, console/network health, and visual evidence**, combining **deterministic engineering checks** with an **AI remediation layer**, presented in a **unique, impressive 3D-themed UI** and shareable via a public report page.

This is one continuous product goal, built in dependency-ordered phases. Each phase ends with a working, reviewable feature.

## 2. Current State (baseline)

Already built and working:
- Next.js 16.2.7 / React 19.2.4 / TypeScript / Tailwind v4 single-page dashboard.
- Synchronous audit API (`POST /api/audits` runs Playwright inline; `GET` reads by id).
- Playwright scanner: desktop (1440) + mobile (390) full-page screenshots, console-error capture, failed/4xx-5xx request capture, heuristic scoring, dedup.
- Strong SSRF URL guard (blocks localhost/private IPv4+IPv6, DNS re-check, per-request route guard).
- Local JSON store (`.data/audits`) + screenshot artifacts (`public/audit-artifacts`), both gitignored.

Gaps vs. the product vision: no axe-core, no AI, no SEO/perf checks, no `/report/{id}` page, no persistence beyond local files, no async jobs, no tests, no CI, cosmetic audit-module checkboxes, not deployable to Vercel as-is.

## 3. Design System (decided)

- **Aurora Glass** base aesthetic across the whole app: dark premium SaaS feel; frosted-glass panels (`backdrop-blur`) in layered z-depth over an aurora gradient-mesh background; subtle tilt/parallax on hover. Predominantly CSS-3D to stay fast and accessible.
- **Three.js / react-three-fiber orb** as the signature hero moment only: a rotating "site health" orb with orbiting score rings. Not used everywhere.
- **Report layout = hybrid**: a **Command Center hero band** always on top (orb + overall score + 5 category score cards), then a **tabbed/filtered detail area** beneath (Overview / Accessibility / SEO / Performance / UX / Screenshots) so 100+ issue reports stay readable.
- **Accessibility of our own UI is a feature, not an afterthought** — we audit accessibility, so the app must honor `prefers-reduced-motion` (disable orb spin / parallax), maintain AA contrast, full keyboard nav, and semantic markup. The 3D must never break a11y.

## 4. Target Architecture

```
src/
  app/
    page.tsx                 # landing + run-audit entry (Aurora Glass)
    report/[id]/page.tsx     # server-rendered shareable report (hybrid layout)
    api/audits/route.ts      # create audit (async job), list
    api/audits/[id]/route.ts # get one audit (status polling)
  components/
    three/                   # react-three-fiber orb + score rings (dynamic import, SSR-safe)
    ui/                       # Aurora Glass primitives: GlassCard, ScoreRing, Tabs, SeverityBadge, motion wrappers
    report/                  # ScoreBand, IssueTable, CategoryPanel, ScreenshotViewer, AiSummary
  lib/
    audit/
      types.ts               # extended model (categories + per-category scores)
      scanner.ts             # Playwright orchestration
      checks/                # deterministic analyzers: a11y (axe), seo, performance, console, network
      scoring.ts             # per-category + overall scoring
    ai/
      provider.ts            # server-side AI abstraction (Claude) + deterministic fallback
      prompt.ts              # structured prompt builder
    store/
      index.ts               # AuditStore interface
      local-store.ts         # current JSON impl (default for dev)
      (db-store.ts)          # Prisma/Postgres impl (later phase)
    url-validation.ts        # existing SSRF guard (kept, hardened)
```

Key architectural decisions:
- **Store behind an interface** so the local JSON impl works now and a DB impl slots in later without touching callers.
- **AI behind a provider abstraction** with a **deterministic fallback**: the app produces a useful summary even with no API key, and uses Claude (latest model) when a key is present. AI augments deterministic checks; it is never the only analyzer.
- **Async job model** introduced in a later phase (`queued | running | completed | failed` + progress polling) to replace the blocking synchronous scan and to enable deployable Playwright.
- **Three.js is dynamically imported and SSR-safe**; the report page renders fully without it (orb is progressive enhancement).

## 5. Extended Data Model (Phase 0)

Extend `AuditCategory` to: `Accessibility | SEO | Performance | UX | Console | Network | BestPractices`.
Extend `scores` to per-category: `overall, accessibility, seo, performance, ux, bestPractices` (+ keep console/network as sub-signals).
`AuditIssue` gains: `category`, `severity`, `title`, `selector?`, `detail`, `fix`, `helpUrl?`, `impact?`, optional `codeSnippet?` for fix-it examples.
Add `AuditModuleSelection` so the UI checkboxes actually toggle which analyzers run.

## 6. Phased Roadmap (sequencing)

Ordered by dependency + impact. Each phase is announced for review/commit when its feature works (lint + build + run verified). **Claude never commits; the user reviews and commits.**

### Phase 0 — Foundations & tooling cleanup (quick, unblocks everything)
- Fix tooling: replace the misleading `react-nextjs-development` skill with an accurate project skill (or convert to a real `.claude/skills/` skill) aligned to Next 16 / React 19 / Tailwind v4; dedupe the two code-reviewer definitions; correct stale facts (CRA, FID→INP).
- Add `vitest` + `@testing-library/react`, a `test` and `typecheck` script; wire lint/build/test as the verification gate.
- Extend the data model (Section 5). Abstract the audit store behind `AuditStore`.
- Update README/AGENTS/CLAUDE for the new architecture.

### Phase 1 — Aurora Glass design system + 3D hero
- Build the Aurora Glass theme (tokens, gradient-mesh background, `GlassCard`, motion wrappers with `prefers-reduced-motion`).
- Build the react-three-fiber **site-health orb** + score rings (dynamic, SSR-safe).
- Re-skin the existing dashboard onto the system; implement the Command Center hero band + tabbed detail shell.

### Phase 2 — Accessibility engine (axe-core) — headline feature
- Inject axe-core into the scanned page; map results to categorized issues with severity, selector, impact, help URL, and a suggested fix.
- Real accessibility score.

### Phase 3 — SEO + Performance + enhanced Console/Network checks
- SEO: title, meta description, H1 structure, canonical, Open Graph/Twitter, lang, robots, image alt coverage.
- Performance: Navigation/Resource Timing (load, DOMContentLoaded, transfer sizes), large-image detection, request counts, render-blocking hints, Core Web Vitals lab signals where feasible.
- Per-category scoring + overall; wire the audit-module checkboxes to actually toggle analyzers.

### Phase 4 — AI remediation layer (Claude + fallback)
- Server-side AI abstraction; structured prompt from real audit data → executive summary, top issues, prioritized remediation, UX suggestions, optional fix-it code snippets.
- Deterministic fallback when no API key; graceful error handling.

### Phase 5 — Report pages, persistence, sharing, export
- `/report/[id]` server-rendered shareable page (the hybrid layout).
- Durable persistence via the store interface (Prisma + Postgres, or SQLite for a zero-config option).
- Public share link, copy-link to the report page (not raw JSON), and PDF/print export.

### Phase 6 — Async jobs, deployability, CI, E2E, deploy
- Convert to async job model with progress polling.
- Make Playwright deployable (worker host or `@sparticuz/chromium`); object-storage abstraction for screenshots.
- GitHub Actions CI (lint + typecheck + build + tests); Playwright E2E for the audit flow.
- Deploy.

### Ongoing — interesting extra features (opportunistic, user-encouraged)
Candidates to pick from: scan **comparison/diff** between two runs or two URLs; **historical trend** of scores; **"fix-it" code snippets** per issue; **embeddable score badge**; **social/OG preview card** of the report; **scheduled re-scans**; **competitor comparison**; **per-issue deep-link** with element highlight overlay on the screenshot.

## 7. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| AI provider | **Claude (latest model)** via server-side abstraction, deterministic fallback | Matches global guidance; app works with or without a key |
| 3D | **react-three-fiber** for the hero orb only; CSS-3D elsewhere | Wow without tanking performance/a11y |
| Testing | **Vitest** + Testing Library; Playwright for E2E | Lightweight, fits Next 16 |
| Persistence | **Store interface**; local JSON now → Prisma/Postgres (or SQLite) later | Don't block feature work on DB provisioning |
| Deployment | Build deploy-ready; provision/deploy in Phase 6 | Architecture first, accounts later |
| Forms/state | Native React + minimal helpers (no Zustand/RHF unless needed) | YAGNI; app is not state-heavy |

## 8. What I'll need from you (non-blocking)
- A **Claude API key** in `.env` (e.g. `ANTHROPIC_API_KEY`) when you want live AI — Phase 4 builds and works without it via the fallback.
- For Phase 6 deploy: hosting/DB accounts (Vercel + a Postgres host, or we use SQLite to stay zero-config).

## 9. Testing & Verification Strategy
- Unit tests (Vitest) for pure logic: URL validation, scoring, check analyzers, AI fallback, store.
- Component tests for UI primitives and report rendering.
- Playwright E2E for the end-to-end audit flow (Phase 6).
- Every phase: `npm run lint && npm run typecheck && npm run build` + a real run, then `code-reviewer` pass, then announce for the user to commit.

## 10. Working Cadence (hard rules)
- Build phase by phase; verify each works before announcing.
- **Claude never commits.** When a major feature is done and verified, announce it; the user reviews and commits.
- Keep the app usable from the first screen; no placeholder marketing pages.
- Update README/AGENTS/CLAUDE/skill when architecture or major capabilities change.
