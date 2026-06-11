# SiteDoc AI Agent Instructions

This file is the source of truth for project instructions. Claude-compatible instructions are mirrored in `CLAUDE.md`; keep both files aligned when the project goal or working rules change.

## Goal

Build SiteDoc AI into a production-quality AI website QA platform that scans a public URL and generates a developer-ready audit report for accessibility, performance, SEO, UX, and visual issues.

Treat this as one continuous project goal, not a day-by-day task list. Keep progressing through the most valuable next implementation step until the product is demo-ready, deployable, and strong enough to present as a highlight project for a middle/senior software engineer CV.

The full original project brief is stored in `docs/PROJECT_BRIEF.md`. Read it when planning product scope, CV positioning, implementation priorities, or demo expectations.

The current phased roadmap and approved design (Aurora Glass 3D UI direction, build sequencing, technical decisions) is in `docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md`. Read it before starting a new phase.

## Product Direction

SiteDoc AI should be easy for an employer or reviewer to judge quickly:

- Enter a public website URL.
- Run an audit.
- See desktop and mobile screenshots.
- Review scores, detected issues, severity, selectors, and fix suggestions.
- Read an AI-generated summary with prioritized remediation steps.
- Share or export the report.

The product should combine deterministic engineering checks with AI explanation. Do not make AI the only analyzer.

## Core Capabilities

- Browser automation with Playwright.
- Accessibility analysis with axe-core.
- SEO and metadata checks.
- Performance and network health checks.
- Console error and failed request collection.
- Desktop and mobile screenshot capture.
- AI-generated executive summary, top issues, and developer fix guidance.
- Persistent audit reports with shareable links.
- Polished responsive dashboard UI.

## Technical Defaults

- Framework: Next.js App Router.
- Language: TypeScript.
- Styling: Tailwind CSS.
- Data: PostgreSQL with Prisma when persistence is added.
- Scanner: Playwright running in a server/worker context.
- Accessibility: axe-core injected into the scanned page.
- AI: OpenAI API or Claude API behind a server-side abstraction.
- Testing: lint, TypeScript build, focused unit tests, and Playwright E2E for critical flows.
- Deployment target: Vercel for the web app; use a worker-friendly host if Playwright cannot run reliably in the web runtime.

## Engineering Standards

- Keep the product usable from the first screen; avoid marketing-only pages.
- Prefer clear, inspectable report UI over decorative visuals.
- Keep implementation steps small, testable, and commit-ready.
- Preserve a clean public repository: no secrets, no local build artifacts, no private notes.
- Update README when setup, architecture, deployment, or major capabilities change.
- Update `AGENTS.md`, `CLAUDE.md`, relevant skills, or subagent descriptions when major project information changes or new project operating rules are introduced.
- Prefer project skills over MCP when a task can be solved with skills alone. Use MCP for external state, repository/connector data, live services, or actions that skills cannot perform.
- Access storage only through the `AuditStore` abstraction (`@/lib/store`). When the AI phase lands, access AI only through the provider abstraction (`@/lib/ai`, introduced then) with a deterministic fallback. Do not weaken the SSRF guard in `@/lib/url-validation`.
- After meaningful code changes, invoke the `code-reviewer` subagent or run an equivalent code-review pass before considering the task complete.
- Verification gate before finishing a substantial change: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- **Do not commit.** When a major feature is complete and verified, announce it and let the maintainer review and commit. The dev environment requires Node 20+.

## Installed Project Skill

Use the project-local skill at `.codex/skills/react-nextjs-development/SKILL.md` for React, Next.js, TypeScript, Tailwind, testing, and deployment guidance when working on this project.

## Subagents And Hooks

- Claude subagent: `.claude/agents/code-reviewer.md`
- Codex-readable subagent description: `.codex/subagents/code-reviewer.md`
- Claude Stop hook reminder: `.claude/hooks/review-reminder.sh`

The hook is a reminder, not a replacement for judgment. It should prompt review when code changes exist at task completion.
