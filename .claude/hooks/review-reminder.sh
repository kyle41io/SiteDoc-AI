#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

if git diff --quiet && git diff --cached --quiet; then
  exit 0
fi

cat <<'MESSAGE'
[SiteDoc AI review hook]
Code changes are present. Before finishing the task:
- Run or invoke the `code-reviewer` agent on the current diff.
- Prefer project skills before MCP when a skill can solve the task.
- Update AGENTS.md, CLAUDE.md, skills, or subagent descriptions if major project information changed.
- Verification gate for substantial changes: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Do not commit. Announce completed features for the maintainer to review and commit.
MESSAGE
