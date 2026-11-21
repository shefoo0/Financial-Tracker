# Tester

Guidance for Claude Code when working in this repository.

## Project status

App Factory: a Claude Code team (the `/new-app` command as master, plus
sub-agents) that builds Expo apps for the App Store and Google Play. See
README.md.

## Money: free only

The developer pays for their Claude subscription and nothing else. Never add
the Anthropic API or SDK, an API key, a paid service or SDK, or anything that
needs a payment method, and don't run cloud builds (`eas build` /
`eas submit`). The only accepted costs are the Apple Developer Program and
Google Play developer accounts, which the developer pays for themselves to
publish.

## Repository layout

- `.claude/commands/new-app.md` — the App Lead (master): plans, delegates,
  integrates, writes the store listing and report.
- `.claude/agents/` — sub-agents: `app-developer`, `code-reviewer`,
  `test-engineer`, `qc-inspector`. Sub-agents can't spawn other sub-agents;
  only the main session delegates.
- `apps/<slug>/` — generated apps (Expo project, `spec.md`, `store/`,
  `REPORT.md`).
- `scripts/check-listing.mjs` — offline checker for store listing limits.
- `test/` — `node:test` tests for the scripts.

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | none at the root (no dependencies); each app: `npm install` in `apps/<slug>` |
| Build / typecheck | per app: `npx tsc --noEmit` in `apps/<slug>` |
| Run tests | `npm test` (root scripts); per app: `npx jest --ci` |
| Lint / format | per app: `npx expo lint` |
| Check a store listing | `node scripts/check-listing.mjs apps/<slug>/store/listing.md` |
| Build an app | `/new-app "<idea>" [bundle id] [monetization]` in Claude Code |

## Conventions

- Keep new code consistent with the surrounding style: match existing naming,
  comment density, and idioms rather than introducing a new style.
- Prefer small, focused commits with descriptive messages.
- Add or update tests alongside behavior changes.

## Notes for Claude

- Before adding a dependency or framework, check whether the project already
  has an established choice for that concern.
- When a command above is still marked _TBD_, look for it in the project's
  manifest (e.g. `package.json`, `Makefile`, `pyproject.toml`) and record it
  here so future sessions don't have to rediscover it.
