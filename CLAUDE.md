# SiteDoc AI Instructions For Claude

This repository is configured for AI-assisted development across multiple agents.

## Start Here

Read `AGENTS.md` first. It is the source of truth for the SiteDoc AI product goal, technical direction, engineering standards, and acceptance expectations.

## Project Goal

Build SiteDoc AI into a production-quality AI website QA platform that scans a public URL and generates a developer-ready audit report for accessibility, performance, SEO, UX, and visual issues.

Treat the work as one continuous product goal. Do not limit progress to a day-by-day checklist.

The full original project brief is stored in:

```text
docs/PROJECT_BRIEF.md
```

The current phased roadmap and approved design is in:

```text
docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md
```

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
- Update `AGENTS.md`, `CLAUDE.md`, relevant skills, or subagent descriptions when major project information changes or new project operating rules are introduced.
- Prefer project skills over MCP when a task can be solved with skills alone. Use MCP for external state, repository/connector data, live services, or actions that skills cannot perform.
- Access storage only through the `AuditStore` abstraction (`@/lib/store`). When the AI phase lands, access AI only through the provider abstraction (`@/lib/ai`, introduced then) with a deterministic fallback. Do not weaken the SSRF guard in `@/lib/url-validation`.
- After meaningful code changes, invoke the `code-reviewer` subagent or run an equivalent code-review pass before considering the task complete.
- Verification gate before finishing a substantial code change: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. The dev environment requires Node 20+.
- **Do not commit.** When a major feature is complete and verified, announce it and let the maintainer review and commit.

## Code Review Agent And Hook

Use the Claude subagent at:

```text
.claude/agents/code-reviewer.md
```

The project also includes a Stop-hook reminder:

```text
.claude/hooks/review-reminder.sh
```

The hook reminds agents to review changed code before task completion. It does not replace the actual code-review pass.
