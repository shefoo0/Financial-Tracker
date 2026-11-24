# Money Planner — report

Version 1.0.0 (not released yet) · Expo SDK 58 · bundle `com.shefoo.moneyplanner` · Finance · AED · English.
Progress and every decision with dates: `PROGRESS.md`. Full feature list: `spec.md`.

## What was built and why

A private, offline money planner for salaried UAE residents who plan in a spreadsheet: it shows **where the money
will be** over the next 60 days and 24 months, and warns before a shortfall or too much debt. No bank link, no
account, no ads, no subscription.

- **Free:** setup wizard (salary, payday, balance); recurring income and costs; one-time items; forecast with
  "safe to spend until payday"; month view with opening and closing balance and category limits; loans, credit
  cards and instalment plans; post-dated cheques; bill reminders and alerts; PIN or biometric lock per profile;
  profiles for a partner or household; automatic backups, backup files and CSV export; light and dark.
  One main bank account plus any number of credit cards and debts.
- **Pro (one-time purchase, with Restore):** all charts and quarterly and yearly reports with PDF; statement
  import (CSV, Excel, OFX, PDF, photos with on-device text recognition, shared bank SMS) with a review screen;
  more bank and cash accounts, moving money between them, the account of each item and a default account.
- **Money model:** balance = bank and cash accounts minus what the credit cards owe. A card purchase lowers it
  on the day of the purchase; paying the card only moves money. Imported card payments are never income.

Why: the market leaders are expense logs (Money Manager, Wallet, Money Lover) with no forecast, instalments or
card limits; the forecast apps are tiny and behind subscriptions. Users complain most about paywalls,
subscriptions, ads, bank sync failing in the Gulf, lost data and poor OCR — the app avoids each one.
Research: `ideas/2026-11-21-similar-modular-finance-forecast.md`, `ideas/2026-11-22-what-users-love-finance.md`.

## Checks (latest results)

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` (apps/moneyplanner) | pass |
| Unit and screen tests | `npx jest --ci` | 1,225 pass |
| Lint | `npx expo lint` | no errors |
| Listing limits | `node scripts/check-listing.mjs apps/moneyplanner/store/listing.md` | all fields pass |
| Pre-flight (every CI check + web walkthrough, free and Pro preview) | `node scripts/preflight.mjs apps/moneyplanner --pro-preview` | all 12 steps pass (8b71f51) |
| Android build + 9 Maestro flows on an emulator | `android.yml` | pass (run 45406352340, free build with the purchase) |
| iPhone simulator: 9 Maestro flows + screenshots | `ios-simulator.yml` | see "Final runs" |
| Accessibility | roles/labels scan, contrast test (light + dark ≥ 4.5:1), targets ≥ 44pt, Reduce motion | pass |

### Final runs
- Android: [run 45406352340](https://github.com/shefoo0/Financial-Tracker/actions/runs/45406352340), free build on 8b71f51 — APK built (debug key; the upload key comes at release), target API check passed, all 9 Maestro flows passed.
- Android Pro preview (for testing Pro on the phone): [run 45379895335](https://github.com/shefoo0/Financial-Tracker/actions/runs/45379895335) — all 9 flows passed on the e2e re-run.
- iPhone simulator: [run 45413350000](https://github.com/shefoo0/Financial-Tracker/actions/runs/45413350000) on c729b4a (new Expo build) — see PROGRESS.md for its result.

## Review and QC verdicts
- **QC (qc-inspector, 2026-11-24): FAIL → fixed.** One blocker: for a free user, saving a new bank account left the
  account pop-up covering the Pro screen (fixed: the form closes first; test added). Passed: listing limits, Pro
  preview can't reach a store build, Pro screen with Restore, privacy answers vs the code, permissions, iOS privacy
  manifest, no placeholders. Minor fixes done: charts listed as Pro, review notes, contact note.
- **Code review:** each milestone was reviewed by the code-reviewer agent (see PROGRESS.md); all blockers and majors
  were fixed before the device runs.

## Assumptions

- Bundle ID `com.shefoo.moneyplanner` (permanent after the first upload).
- Pro product `com.shefoo.moneyplanner.pro`, a one-time non-consumable; price set by the developer in the store
  consoles (spec suggests about AED 29-49). The app shows the store's own price.
- Category Finance (App Store secondary: Productivity); age rating 4+ / IARC Everyone.
- Debt-to-income alert levels 40% / 50% (UAE Central Bank's 50% limit; verify before release).
- Support email is the alias in `store/support.md`; privacy policy at
  `https://shefoo0.github.io/Financial-Tracker/privacy/moneyplanner/` once GitHub Pages is on.

## Findings still open

- Real purchase not tested yet: needs the Google Play account (on hold) and the product created in the consoles.
- Needs checks on a real phone: everything in the latest APK, especially import, accounts and the purchase screen.

## Before you submit

1. Test the latest APK on your phone (import, accounts, cards, move money, lock, backups).
2. Turn on GitHub Pages: repository Settings → Pages → branch `main`, folder `/docs`; open the privacy page link.
3. Google Play (developer account, $25 once): create the app, the managed product `com.shefoo.moneyplanner.pro`,
   add licence testers, and run the 12-tester, 14-day closed test.
4. Apple (Developer Program, $99/year): create the app and the non-consumable `com.shefoo.moneyplanner.pro`.
5. Run `/release-app moneyplanner` — it walks through screenshots, store graphics, the upload key, signed builds
   (AAB and iOS) and the console forms (Data safety, privacy label, financial features declaration).

Nothing else costs money: builds run on GitHub Actions' free minutes and Expo's free plan (iOS only).
