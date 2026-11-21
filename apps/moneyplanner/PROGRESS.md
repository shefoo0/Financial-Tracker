# Money Planner — progress

Legend: `[ ]` to do · `[~]` in progress · `[x]` done

## Steps
- [x] 1. Research and plan — research in `ideas/2026-11-21-similar-modular-finance-forecast.md`; spec in `spec.md`
- [x] Developer confirmed the spec and milestones; bundle ID `com.shefoo.moneyplanner` for now (can change before the first upload)
- [x] 2. Scaffold — Expo SDK 58 template, deps, app.json, shared types/lib/data contracts, UI kit, navigation, tab icons, Jest + lint
- [~] Milestone 1 — Core planner
  - [~] T1 engine · [~] T2 data and backup · [~] T3 plan and item screens · [~] T4 dashboard and month · [~] T5 wizard, settings and categories
  - [ ] review · [ ] tests · [ ] fix loop · [ ] Android test build
- [ ] Milestone 2 — Debts, cheques, alerts, lock: T6 · T7 · T8 · T9 · review · tests · Android test build
- [ ] Milestone 3 — Import and OCR: T10 · T11 · T12 · T13 · review · tests · Android test build
- [ ] Milestone 4 — Pro unlock and store: T14 · store material · QC · Android test build · REPORT.md

## Decisions
- Bundle ID `com.shefoo.moneyplanner`, read from `com.<Shefoo>.moneyplanner` (IDs are lowercase, no `<>`); needs the developer's confirmation, because it's permanent after the first upload.
- The developer chose the full scope (OCR in v1) over the research's recommended forward-planner-first option; OCR is milestone 3, so milestones 1-2 ship a usable app first.
- Money is stored in integer fils; the forecast engine is pure TypeScript, tested without React or storage.
- Free core limits: 10 recurring items, 2 debts, 2 cheques, 2 imports a month. Pro is a one-time purchase.
- Debt-to-income defaults: 40% caution, 50% high (the UAE Central Bank's limit, to be verified before release).

- Cloud sessions: Expo CLI needs `EXPO_OFFLINE=1` (Expo's servers are blocked); versions come from the installed SDK.
- Routes live in `src/app/` (SDK 58 template), not `app/` as the spec's task table says.

## Open findings
- (none yet)
