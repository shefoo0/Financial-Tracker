# Tester

Guidance for Claude Code when working in this repository.

## Project status

App Factory: a Claude Code team (the `/new-app` command as master, plus
sub-agents) that builds Expo apps for the App Store and Google Play. See
README.md.

## Developer profile

- Country: United Arab Emirates. Store research uses `--country ae`, plus `us`
  for the global picture.
- Default currency AED; English first (Arabic and right-to-left later).
- Works in Claude Code cloud sessions on GitHub, with no build tools on a PC.
  Android builds and tests run on GitHub Actions (`.github/workflows/`); the
  developer installs the APK on an Android phone. The developer has no iPhone
  or Mac: iOS is tested with `ios-simulator.yml` (iPhone simulator on GitHub's
  free macOS runner). The paid Apple Developer Program (for TestFlight and the
  App Store via `ios.yml`) comes closer to release.
- Start workflows with the GitHub tools (`actions_run_trigger`), and read the
  results with `actions_get` and `get_job_logs`.
- Personal Google Play account, so a 12-tester, 14-day closed test comes
  before the first public release.

## Money: free only

The developer pays for their Claude subscription and nothing else. Never add
the Anthropic API or SDK, an API key, a paid service or SDK, or anything that
needs a payment method. The one cloud service allowed is **Expo's free plan,
for iOS builds and uploads only** (`eas build`/`eas submit`/`eas credentials`
with `--platform ios`, run from `/release-app`), because iOS needs macOS to
build: never add a payment method, upgrade, or use priority builds.
**GitHub Actions** is allowed on its free minutes, on standard `ubuntu-latest`
runners only (never larger, billed runners); keep workflows started by hand
(`workflow_dispatch`), not on every push. The one exception is the `test` job
of `ios-simulator.yml`, which uses the free `macos-latest` runner (counted 10x
on private repos, capped at 30 minutes) because the developer has no iPhone or
Mac; run it at milestone ends, not on every change. The only accepted costs are the Apple Developer Program and
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
  `test-engineer`, `qc-inspector`, `market-researcher`, `app-scout`. Their
  `tools` lists leave out `Agent`, so only the main session delegates. They
  have `maxTurns` limits; developer, tester and QC keep lessons in
  `.claude/agent-memory/<name>/MEMORY.md` (commit these).
- `.claude/settings.json` + `.claude/hooks/guard-bash.mjs` — a PreToolUse hook
  that allows Expo's free cloud only for iOS (build/submit/credentials with
  `--platform ios`) and blocks other EAS use (Android or all-platform cloud
  builds, updates, workflows, priority builds), force-pushes, destructive
  deletes and reading signing keys, Apple API keys and passwords; `permissions.deny` blocks reading them too.
  Change the rules in the hook (and its tests), not by weakening the deny list.
- `.github/workflows/` — `android.yml` (type check, unit tests, signed APK
  and AAB, target API check, Maestro on an emulator), `android-upload-key.yml`
  (creates the upload key once; private repos only), `ios.yml` (queues an iOS
  build and TestFlight upload on Expo's free plan; needs the paid Apple
  program), `ios-simulator.yml` (no iPhone or paid Apple account needed: Expo's
  free simulator build, then Maestro flows and screenshots of the main screens
  on an iPhone simulator; flows in `apps/<slug>/.maestro/`, screenshot flow in
  `apps/<slug>/.maestro-screens/`). All workflows use `shell: bash` (pipefail). Check changes with
  `npm test` (the workflow tests parse them and `bash -n` their scripts).
- `apps/<slug>/` — generated apps (Expo project, `spec.md`, `store/`,
  `REPORT.md`, `PROGRESS.md` for resuming a run, `RELEASES.md`).
- `scripts/` — free local tools: `check-listing.mjs` (listing limits),
  `screenshots.mjs` (store screenshots from the web build, via Playwright),
  `render-graphic.mjs` (HTML → exact-size PNG), `publish-pages.mjs` (privacy
  and support pages into `docs/` for GitHub Pages), `bump-version.mjs`,
  `app-status.mjs` (SDK and release status of every app), `android-signing.mjs`
  (release builds sign with the upload key from env vars), `store-lookup.mjs`
  (real ratings, prices, and low-star and 5-star reviews from both stores, for research),
  `run-maestro.sh` (runs each Maestro flow in CI and prints the screen on a failure),
  `preflight.mjs` (every GitHub workflow check, run locally in CI order, before any device run).
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
| Store research data | `node scripts/store-lookup.mjs search "<term>" --country ae` |
| Check a store listing | `node scripts/check-listing.mjs apps/<slug>/store/listing.md` |
| Build an app | `/new-app "<idea>" [bundle id] [monetization]` in Claude Code |
| Change an app | `/update-app <slug> "<change>"` |
| Pre-flight before GitHub | `node scripts/preflight.mjs apps/<slug> [--pro-preview]` |
| Android test build | `android.yml` workflow, `app: <slug>`, `build: test` |
| iOS build + TestFlight | `ios.yml` workflow, `app: <slug>` |
| Release an app | `/release-app <slug> [android\|ios\|both]` |
| Find app ideas | `/find-ideas [topic]` |
| Ideas close to yours | `/similar-ideas ["<idea>" \| <slug>]` |
| Maintenance (every ~3 months) | `/maintain-apps` |

## Cloud sessions

- The network blocks Expo's servers, so prefix Expo CLI commands with
  `EXPO_OFFLINE=1` (e.g. `EXPO_OFFLINE=1 npx expo install <pkg>`); versions
  then come from the installed SDK. npm works normally.
- Start cloud sessions on the **Tester** environment (store research hosts).

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
