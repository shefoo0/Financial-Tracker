# Money Planner — progress

Legend: `[ ]` to do · `[~]` in progress · `[x]` done

## Steps
- [x] 1. Research and plan — research in `ideas/2026-11-21-similar-modular-finance-forecast.md`; spec in `spec.md`
- [x] Developer confirmed the spec and milestones; bundle ID `com.shefoo.moneyplanner` for now (can change before the first upload)
- [x] 2. Scaffold — Expo SDK 58 template, deps, app.json, shared types/lib/data contracts, UI kit, navigation, tab icons, Jest + lint
- [x] Milestone 1 — Core planner
  - [x] T1 engine · [x] T2 data and backup · [x] T3 plan and item screens · [x] T4 dashboard and month · [x] T5 wizard, settings and categories
  - [x] review (3 reviewers) · [x] tests (208 unit + screen tests, 4 Maestro flows) · [x] fix loop round 1 (all blockers/majors fixed)
  - [x] Android test build: run 44936594995 passed (APK `moneyplanner-1.0.0-1-android`, signed with the upload key, target API check passed; first cold build 35 min)
  - [x] First real runs: the app installs and opens on the Android emulator and the iPhone simulator; "delete all data" passed on both; 3 flows failed on test-script issues (off-screen taps, iOS number pad couldn't be closed)
  - [x] Fixes: iOS "Done" bar above number pads (app), flows scroll and use a shared dismiss-keyboard subflow (tests)
  - [x] Re-runs 44941101336 (Android) and 44942614309 (iPhone): first launch and delete-all pass; flows 02/03 found a real bug (form stayed open after Save: "Discard changes?" guard), fixed in 624a390
  - [x] Re-runs with the fix: android.yml run 44944552322, ios-simulator.yml run 44944555203
- [x] Redesign + profiles (developer asked after testing the first build; spec §12; design/redesign-2026.png)
  - [x] Lead: tokens, profile types/provider, layouts · [x] R1 stores · [x] R2 kit · [x] R3 dashboard · [x] R4 month/plan/forms · [x] R5 profiles/settings/wizard · [x] quick-add button (one-handed use; developer asked)
  - [x] review (no blockers; major + minors fixed) · [x] tests (287 Jest, Maestro 05-profiles) · [x] fix loop · [x] Android + iPhone test runs — Android run 45007110473 and iPhone simulator run 45011207458: all 5 flows + screenshots pass
  - [x] Save-closes-form fix v2: the state-based guard switch was still blocked on iPhone (run 44944555203); now a ref mark + repeat
- [~] Milestone 2 — Debts, cheques, alerts, lock (decisions in spec "Milestone 2 decisions")
  - [x] Lead: types, repository interface, schema v2, plan input, expo-notifications/local-authentication/secure-store/crypto + app.json plugins
  - [x] D data · [x] T6 engine (logged payments after the balance date count as outflows) · [x] T7 debts screens · [x] T8 cheques screens · [x] T9 alerts + lock · [x] lead wiring (Plan cards, routes, dashboard alerts, lock gate + scheduler, modules on, CSV buttons)
  - [x] review (1 blocker: lock bypass with modals; 4 majors; all fixed) · [x] tests (502 Jest; Maestro 06 debt, 07 cheques, 08 lock) · [x] fix loop · [~] Android + iPhone test runs
- [ ] Milestone 3 — Import and OCR: T10 · T11 · T12 · T13 · review · tests · Android test build
- [ ] Milestone 4 — Pro unlock and store: T14 · store material · QC · Android test build · REPORT.md

## Release bar: beat the competition (developer, 2026-11-22)
Ship only when every row is done. Source: ideas/2026-11-21-similar-modular-finance-forecast.md (competitor complaints).
- [x] No paywall to try it: free core works fully; Pro is one-time (M4) — never block first use.
- [x] Flexible schedules (every N weeks/months, last day, move/skip/change one payment, partial and extra payments).
- [x] Cards with limit/available/usage, 0% instalment plans with editable dates, UAE cheques.
- [x] Works offline, no account, per-profile lock.
- [x] **"Safe to spend until payday"** on Home (the loved Rocket Money "Payday view": what's left after bills until the next salary) — the clearest everyday reason to open the app.
- [x] **"Mark paid" in one tap** from Coming up (bills, card payments, cheques) — users ask for a "Pay bill" button.
- [x] **Never lose data**: automatic local backup (last 7 days, rotated) plus a monthly "save a backup file" reminder; restore from the automatic copies in Settings.
- [x] **Quarterly and yearly reports** (spec §13, Pro; free users see a labelled sample report) with PDF export — no competitor offers company-style personal reports.
- [ ] **Bill reminders** for every upcoming bill, instalment and cheque, with a lead time (default 1 day before, 09:00), per item on/off — the most loved thing in 5-star reviews (ideas/2026-11-22-what-users-love-finance.md: 39 hits; TimelyBills' whole base).
- [ ] **Faster entry**: recent-item chips and last-used category on the add forms, "repeat this" templates — under 10 seconds per item (55 "fast/easy" hits; widget praise is really about speed).
- [ ] **Optional monthly limit per category** with "spent vs left" on Month (≈29 mentions/wishes) — optional, no envelope or zero-based rules.
- [ ] **Opening and closing balance per month** on Month (small, asked for by Wallet/EveryDollar users).
- [x] Daily allowance ("about AED x a day") — already in the payday card.
- Later (v1.1 / after launch): month calendar grid; Android home-screen widget (needs native code; few mentions).
- [ ] First use in under 60 seconds to a useful forecast (time the wizard in the walkthrough).
- [ ] UX audit of every screen from the walkthrough screenshots (light + dark, one-handed reach, empty states, wording, tap targets, numbers readable at a glance) — fix every major item.
- [ ] Statement import with good OCR (M3) — competitors' OCR is "garbage" and paywalled; ours must read totals correctly and be free to try.
- [ ] Accessibility pass (VoiceOver/TalkBack labels, large text, contrast) and store-quality QC (M4).

## Decisions
- Bundle ID `com.shefoo.moneyplanner`, read from `com.<Shefoo>.moneyplanner` (IDs are lowercase, no `<>`); needs the developer's confirmation, because it's permanent after the first upload.
- The developer chose the full scope (OCR in v1) over the research's recommended forward-planner-first option; OCR is milestone 3, so milestones 1-2 ship a usable app first.
- Money is stored in integer fils; the forecast engine is pure TypeScript, tested without React or storage.
- Free core limits: 10 recurring items, 2 debts, 2 cheques, 2 imports a month. Pro is a one-time purchase.
- Debt-to-income defaults: 40% caution, 50% high (the UAE Central Bank's limit, to be verified before release).

- Cloud sessions: Expo CLI needs `EXPO_OFFLINE=1` (Expo's servers are blocked); versions come from the installed SDK.
- Routes live in `src/app/` (SDK 58 template), not `app/` as the spec's task table says.

- Redesign: Bold cards + Glass fintech, light and dark with an Appearance setting; profiles on one phone, one database per profile (the first keeps moneyplanner.db, so no data migration); no money accounts; no version bump (1.0.0 isn't released yet).

- Reports are Pro only (developer's choice); a sample report with demo numbers shows free users what they get.

## Open findings
- Privacy policy URL (`src/features/settings/links.ts`) is filled at release; the repo is private, so GitHub Pages needs a public repo for the pages.
- Module switches are hidden until each module ships: add it to `AVAILABLE_MODULES` in `src/data/modules.ts`.
- Needs a real-device check: native tabs, date picker, SQLite, backup/restore/CSV share sheets, discard-changes prompt, keyboard and safe areas, month swipe.
- Month view expands occurrences twice (minor performance; fine for now).
