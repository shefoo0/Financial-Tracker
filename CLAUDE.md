# Tester

Guidance for Claude Code when working in this repository.

## Project status

App Factory: a Claude Managed Agent (TypeScript runner, `@anthropic-ai/sdk`)
that builds Expo apps for the App Store and Google Play. See README.md.

## Repository layout

- `agents/app-builder/` — Managed Agents resources synced with `ant apply`:
  `agent.md` is the App Lead (master/coordinator, roster in `multiagent`),
  plus `environment.yaml` and `vault.yaml`. Sub-agents live in
  `agents/{app-developer,code-reviewer,test-engineer,qc-inspector}/agent.md`
  and are referenced by relative path (needs `ant` 1.40+). Sub-agents must
  not have their own `multiagent` block (one level of delegation only).
  `claude-lock.json` (written by `ant apply`) holds their IDs; commit it.
- `src/` — CLI that starts a session per app idea (`new-app.ts`), the
  outcome/rubric (`outcome.ts`), event formatting (`events.ts`), arg
  parsing, lock-file lookup.
- `test/` — `node:test` unit tests, run through tsx.

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Build / typecheck | `npm run typecheck` |
| Run tests | `npm test` |
| Lint / format | _none configured_ |
| Sync agent config | `ant apply --dry-run -v agents/app-builder`, then `ant apply agents/app-builder` |
| Build an app | `npm run new-app -- "<idea>" [--bundle-id ...]` |

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
