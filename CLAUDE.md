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
- `.claude/commands/update-app.md` — the App Lead for changes to an existing app.
- `.claude/commands/find-ideas.md` — researches niches in parallel and writes
  a ranked shortlist to `ideas/`.
- `.claude/commands/similar-ideas.md` — studies popular apps around a seed
  idea (or apps in `apps/`) with parallel `app-scout`s; writes variations to
  `ideas/`.
- `.claude/commands/maintain-apps.md` — yearly store requirements, SDK
  upgrades and security fixes; logs to `MAINTENANCE.md`.
- `.claude/commands/release-app.md` — step-by-step release guide (screenshots,
  graphics, pages, signed builds, store consoles). Secrets never go in chat or
  the repo; signing keys live in `~/.app-signing/`.
- `.claude/agents/` — sub-agents: `app-developer`, `code-reviewer`,
  `test-engineer`, `qc-inspector`, `market-researcher`, `app-scout`. Sub-agents can't spawn other sub-agents;
  only the main session delegates.
- `apps/<slug>/` — generated apps (Expo project, `spec.md`, `store/`,
  `REPORT.md`).
- `scripts/` — free local tools: `check-listing.mjs` (listing limits),
  `screenshots.mjs` (store screenshots from the web build, via Playwright),
  `render-graphic.mjs` (HTML → exact-size PNG), `publish-pages.mjs` (privacy
  and support pages into `docs/` for GitHub Pages), `bump-version.mjs`,
  `app-status.mjs` (SDK and release status of every app).
- `ideas/` — research shortlists from `/find-ideas`.
- `docs/` — generated GitHub Pages site; don't edit by hand.
- `test/` — `node:test` tests for the scripts.

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` then `npx playwright install chromium` (root); each app: `npm install` in `apps/<slug>` |
| Build / typecheck | per app: `npx tsc --noEmit` in `apps/<slug>` |
| Run tests | `npm test` (root scripts); per app: `npx jest --ci` |
| Lint / format | per app: `npx expo lint` |
| Check a store listing | `node scripts/check-listing.mjs apps/<slug>/store/listing.md` |
| Build an app | `/new-app "<idea>" [bundle id] [monetization]` in Claude Code |
| Change an app | `/update-app <slug> "<change>"` |
| Release an app | `/release-app <slug> [android\|ios\|both]` |
| Find app ideas | `/find-ideas [topic]` |
| Ideas close to yours | `/similar-ideas ["<idea>" \| <slug>]` |
| Maintenance (every ~3 months) | `/maintain-apps` |

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
