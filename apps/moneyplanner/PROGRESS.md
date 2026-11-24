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
- [x] Milestone 2 — Debts, cheques, alerts, lock (decisions in spec "Milestone 2 decisions")
  - [x] Lead: types, repository interface, schema v2, plan input, expo-notifications/local-authentication/secure-store/crypto + app.json plugins
  - [x] D data · [x] T6 engine (logged payments after the balance date count as outflows) · [x] T7 debts screens · [x] T8 cheques screens · [x] T9 alerts + lock · [x] lead wiring (Plan cards, routes, dashboard alerts, lock gate + scheduler, modules on, CSV buttons)
  - [x] review (1 blocker: lock bypass with modals; 4 majors; all fixed) · [x] tests (502 Jest; Maestro 06 debt, 07 cheques, 08 lock) · [x] fix loop · [x] Android + iPhone test runs
  - [x] Earlier runs (old private repo): Android 45153618898 passed all 8 flows; iPhone 6/8 → fixed whole-row switches (lock) and amount patterns (06), check-maestro flags bare amounts
  - [x] Final runs on the public repo `shefoo0/financial-tracker`, commit 47a27ad, pre-flight passed first: android.yml run 45184675406 (APK built with the debug key; all 8 flows passed on the re-run of the e2e job; attempt 1 lost the emulator — "device offline" at app launch in 06, no app error) and ios-simulator.yml run 45184669279 (new Expo build; all 8 flows passed)
  - Note: the 8 iPhone flows took ~25 minutes; the macOS job's cap was raised from 30 to 60 minutes (hang guard only, minutes are free on the public repo), leaving room for the M3 import flows
- [~] Milestone 3 — Import and OCR (Pro): [x] T10 parsers (+xlsx, Arabic, learned rules) · [x] T11 PDF · [x] T12 OCR · [x] T13 flow/review/share-in · [x] review (6 majors fixed) · [x] tests (938 Jest; walkthrough free + Pro preview) · [~] device runs · review · tests · [x] Android test build
  - [x] Pro preview Android build for the developer's phone: android.yml run 45195728692 on main 2400515 (`pro_preview: true`, debug key; pre-flight --pro-preview passed first); APK `moneyplanner-1.0.0-1-android` (expires 2026-12-07); all Maestro flows passed on the emulator
  - [x] Developer imported a real statement on the phone: good overall. Fixed from the feedback (2026-11-23):
    - minus amounts went to income on a card statement (the PDF reader read every minus on a card statement as a refund); now a minus means spending when most signed amounts carry one, as in CSV/Excel
    - spending with no matching category now goes to "Other" instead of no category
    - card payments ("payment received", "thank you for your payment", autopay…) as money in start unticked with a "Card payment" label: not income, so they are left out
    - app icon was a white square with a dot: the adaptive-icon foreground had been rendered without transparency; re-rendered with `render-graphic.mjs --transparent`, and test/app-icons.test.mjs guards it
  - [x] Pro preview build with these fixes and the design fixes: android.yml run 45213129450 on 5c1f27c (pre-flight --pro-preview passed first); all Maestro flows passed on the e2e re-run (attempt 1: emulator went offline at launch in 07; the auto-retry missed it, fixed in df3d6f8)
  - [ ] Developer re-tests the import (minus = spending, Other, card payment left out) and the icon on the phone
- [ ] Milestone 3b — Money accounts, cards and transfers (developer decided 2026-11-23: accounts yes, several accounts Pro with one free, ship the small card-payment fix first; spec "Milestone 3b decisions")
  - [x] Small fix first: card payments on a statement are logged on the matching card in Debts (only card / last 4 digits / file name, else the user picks or leaves it out), never income; saved with the import in one transaction
  - [~] Randomized import tests (test agent): generated statements in every format with random amounts and dates, checked against the ground truth
  - [x] Plan agreed (2026-11-23): free = one bank account + cards, Pro = more accounts, per-item/recurring account and a default account; card forecast from actual purchases; spec "Milestone 3b decisions"
  - [x] A1 data: accounts (bank/cash; main = the Settings balance, named), accountId/cardId on items, recurring, imports and layouts, default account setting, schema v6 (NULL = main account, no copying; upgrade tested from v1-v5), backup v3 (v1/v2 still restore), CSV Account column
  - [x] A2 engine: total of accounts in Balance today, forecast, history and report balances (per-account breakdown adds up); card items never move cash, card forecast bills actual purchases per statement (statement day before the due day) under the full/minimum/fixed plan; Month "paid to cards" for cards with recorded purchases (others unchanged); transfers (transferId, added to the unreleased schema v6) never income or spending; 1,161 tests
  - [x] A3 import: "Into" target per review (main / account / card; remembered per file source, not for pasted text; card statements default to the matching card); card statements charge purchases and refunds to the card; bank "credit card payment" rows pay the named card (left out when the card statement already logged it); money in that pays a card is never income; transfer pairing with another own account (same amount, other direction, ≤5 days) with "Not a transfer"; 1,175 tests
  - [x] A4 screens: Settings → Accounts (rename main, add/edit/close bank & cash accounts — Pro; cards listed, open Debts; default account — Pro); Home balance sheet "By account"; "Paid from / Received into" on one-time and recurring items (free: main or a card; Pro: any account, default for new items); Move money (Pro, + button, two sides with one transferId); Month/Home "Paid to cards"; walkthrough section 14 (free + Pro) and Maestro flow 09-accounts; pre-flight passed; 1,201 tests
  - [x] Device runs: android.yml run 45254204820 (Pro preview, b249cb9): APK built, all 9 flows passed (emulator dropped out on 07 and 09; the retry saved both); ios-simulator.yml run 45261839049 (0ff26f8, reusing Expo build c8c1b1d6): all 9 flows + screenshots passed (the first run 45254210180 failed only 09-accounts: iOS reads the account row as one label — fixed in the flow)
  - [ ] Developer tests 3b on the phone (APK from run 45254204820)
- [x] Design fixes (developer, 2026-11-23): sample charts' Unlock Pro is now compact and on the left, so Home's floating "+" (bottom-right) no longer covers it; the demo household pays rent in six AED 11,000 cheques instead of four of 22,000, so the Savings rate sample stays between about -11% and 78% (a test keeps it within -50%..100%). Pre-flight --pro-preview passed; not yet on a device build
- [x] 3b feedback round 2 (developer, 2026-11-24), commits dfe6e1e + 8cf45d6, android.yml run 45379895335 (Pro preview; all 9 flows passed on the e2e re-run — attempt 1 lost the emulator's Maestro driver in 09):
  - chart scrubbing locks the screen's scroll (6775dc6)
  - balance = bank and cash accounts minus what the cards owe, everywhere (Home, forecast line, history, alerts, By account); a card purchase lowers it on its day, paying the card moves nothing (`cardCharges`, `cardOwedAt`, `cardsOwed`)
  - Accounts: "Add an account, card or debt" asks what it is (bank/debit, cash — Pro; credit card, loan — free, continue to the Debts form); overdrawn switch (negative balance)
  - Home: visible "By account ›" link under the balance
  - bug: Move money did nothing when made on the day the balances were set; a transfer now counts from an account's start day (`countsAfterStart(…, transfer)`, `transfersOn`)
  - [ ] Developer: remove cards that were added as bank accounts and add them again as credit cards; re-test on the phone
- [~] Milestone 4 — Pro unlock and store (started 2026-11-24; each step is committed and pushed when done, so a new session can resume here)
  - [x] M4.1 Accessibility pass: scanned every Pressable (all have a role and label; 2 modal backdrops got a role), touch targets ≥ 44pt (buttons 50, PIN keys 72, small links use hitSlop), font scaling on (only chart tooltips cap it at 1.2-1.4x), every chart has a spoken label, contrast test for text/secondary/accent/status colours on screen and card backgrounds in light and dark (all ≥ 4.5:1, src/constants/__tests__/contrast.test.ts), wrong PIN is announced and its shake is skipped with Reduce motion
  - [x] M4.2 T14 Pro one-time purchase + Restore (e6d41fb): expo-iap 6.4.2 (MIT, no server, no key) behind src/lib/purchases.ts + store.ts (store.web.ts: none); ProProvider remembers the unlock in secure storage, checks the store at start (refund locks), restore; /pro screen (features, store price, buy, restore; "can't be bought in this version" without a store); every Unlock Pro opens it; 18 tests; listing/Data safety/spec updated. [ ] Developer at release: create product `com.shefoo.moneyplanner.pro` (Play: managed product; App Store: non-consumable) and test a real purchase with a licence tester (Play account on hold). [ ] Native build check (Android run)
  - [ ] M4.3 QC (qc-inspector): store rules, listing limits, privacy answers vs code, placeholders; fix findings
  - [ ] M4.4 Store screenshots (scripts/screenshots.mjs) into store/screenshots
  - [ ] M4.5 Privacy + support pages into docs/ (scripts/publish-pages.mjs) for GitHub Pages
  - [ ] M4.6 REPORT.md
  - [ ] M4.7 Pre-flight + Android test build (and iPhone simulator at the end)
  - Later, at release (needs the developer): upload key, signed AAB, Play closed test, Apple program

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
- [x] **Bill reminders** for every upcoming bill, instalment and cheque, with a lead time (default 1 day before, 09:00), per item on/off — the most loved thing in 5-star reviews (ideas/2026-11-22-what-users-love-finance.md: 39 hits; TimelyBills' whole base).
- [x] **Faster entry**: recent-item chips and last-used category on the add forms, "repeat this" templates — under 10 seconds per item (55 "fast/easy" hits; widget praise is really about speed).
- [x] **Optional monthly limit per category** with "spent vs left" on Month (≈29 mentions/wishes) — optional, no envelope or zero-based rules.
- [x] **Opening and closing balance per month** on Month (small, asked for by Wallet/EveryDollar users).
- [x] Daily allowance ("about AED x a day") — already in the payday card.
- Later (v1.1 / after launch): month calendar grid; Android home-screen widget (needs native code; few mentions).
- [ ] First use in under 60 seconds to a useful forecast (time the wizard in the walkthrough).
- [ ] UX audit of every screen from the walkthrough screenshots (light + dark, one-handed reach, empty states, wording, tap targets, numbers readable at a glance) — fix every major item.
- [ ] Statement import with good OCR (M3) — competitors' OCR is "garbage" and paywalled; ours must read totals correctly and be free to try.
- [ ] Accessibility pass (VoiceOver/TalkBack labels, large text, contrast) and store-quality QC (M4).

## Launch plan (developer, 2026-11-22)
- Start the Google Play **closed test** (12+ testers, 14 days) right after milestone 2 passes on the phones; keep building M3 (import) and M4 (Pro purchase) and ship them to testers as updates; apply for production after 14 days.
- [ ] Developer: Play developer account ON HOLD (personal accounts show the full legal name; developer is checking options); collect 12+ testers' Gmail addresses.
- [~] Release kit: [x] store listing, [x] icon, [x] feature graphic, [x] privacy/support text; [ ] phone screenshots, privacy + support pages from a small PUBLIC repo (GitHub Pages; the code repo stays private), Data safety / content rating / financial features answers, signed AAB.

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
- Privacy policy URL (`src/features/settings/links.ts`) is filled at release; the repo is now public (`shefoo0/financial-tracker`), so GitHub Pages can host the pages (milestone 4).
- Module switches are hidden until each module ships: add it to `AVAILABLE_MODULES` in `src/data/modules.ts`.
- Needs a real-device check: native tabs, date picker, SQLite, backup/restore/CSV share sheets, discard-changes prompt, keyboard and safe areas, month swipe.
- Month view expands occurrences twice (minor performance; fine for now).
