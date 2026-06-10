# SiteDoc AI Instructions For Claude

This repository is configured for AI-assisted development across multiple agents.

## Start Here

Read `AGENTS.md` first. It is the source of truth for the SiteDoc AI product goal, technical direction, engineering standards, and acceptance expectations.

## Project Goal

Build SiteDoc AI into a production-quality AI website QA platform that scans a public URL and generates a developer-ready audit report for accessibility, performance, SEO, UX, and visual issues.

Treat the work as one continuous product goal. Do not limit progress to a day-by-day checklist.

## Use The Installed Skill

When working on React, Next.js, TypeScript, Tailwind CSS, testing, or deployment tasks, read and follow:

```text
.codex/skills/react-nextjs-development/SKILL.md
```

The skill source and license are documented in:

```text
.codex/skills/react-nextjs-development/SOURCE.md
.codex/skills/react-nextjs-development/LICENSE
```

## Working Rules

- Keep the app usable from the first screen.
- Prefer real product behavior over placeholder marketing pages.
- Combine deterministic audit checks with AI-generated explanation.
- Keep commits clean and avoid secrets, local artifacts, or private notes.
- Update `README.md` when setup, architecture, deployment, or major capabilities change.
- Before finishing a substantial code change, run `npm run lint` and `npm run build`.
