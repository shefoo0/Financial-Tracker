# Money Planner — spec

**Slug:** `moneyplanner` · **Bundle ID / package:** `com.shefoo.moneyplanner` (from the request `com.<Shefoo>.moneyplanner`; IDs are lowercase and can't contain `<>`) · **Version:** 1.0.0 · **Expo SDK:** 58 (React Native 0.88, New Architecture) · **Store category:** Finance · **Currency:** AED (label; amounts stored in fils) · **Language:** English

## Who it's for

Salaried UAE residents who run their money in a spreadsheet: a setup list of recurring income and costs, a tab per month for one-time items, and a dashboard of free money and category totals. They want to see **where their money will be in the coming months**, including loans, credit cards, card instalment plans and post-dated rent cheques, and to be warned **before** a shortfall or too much debt. They don't want to link their bank, create an account, watch ads, or pay a subscription.

## The gap (from `ideas/2026-11-21-similar-modular-finance-forecast.md`)

- **Leaders are expense logs, not planners:** Money Manager (Realbyte, Android 4.6, 469,955 ratings, 10M+), Money manager & expenses (innim, 4.8, 494,465, 10M+), Wallet (4.7, 389,363, 10M+), Money Lover (4.4, 208,329, 5M+), Rocket Money and Monarch (US bank-linking subscriptions). None forecasts balances or tracks instalments and card limits.
- **Forecast apps are tiny and paywalled:** Money Forecast: CashFlow (iOS us 4.3, 77 ratings, subscription wall); newer ones have 1-21 ratings.
- **Users ask for exactly this:** "0% installment options (3/6/10 mos) with auto-generated entries and editable bill dates" (Money Lover); credit limit, outstanding and available balance (Money Manager).
- **Top complaints to avoid:** paywalls and subscriptions, ads, bank sync failing in the Gulf, updates wiping data, rigid recurring schedules, poor OCR.

**Positioning:** private, offline, no account, no ads, one-time unlock, never loses data, built for UAE money patterns.

## Modules

The user switches optional modules on in Settings or in the setup wizard. Turned-off modules hide their screens and are left out of the forecast.

| Module | Always on? | What it does |
| --- | --- | --- |
| **Planner** (core) | Yes | Starting balance, recurring income and costs, one-time items, categories, month and year dashboard, forecast |
| **Debts** | Optional | Loans, credit cards, card instalment and buy-now-pay-later plans |
| **Cheques** | Optional | Post-dated cheques (rent and others) as dated future payments |
| **Alerts** | Optional (on by default) | Local notifications from the forecast |
| **Import** | Optional | Statement import: CSV/OFX, PDF text, and on-device OCR for photos and scanned pages, with a review screen |

## Features and screens

### 1. Setup wizard (first launch)
Currency label (AED), salary amount and payday, current bank balance, a "buffer" (minimum balance the user wants to keep), and which modules to switch on. Every step can be skipped and changed later in Settings.

### 2. Recurring items (the spreadsheet's Setup sheet, improved)
- Income or cost; name; category; amount; schedule: **monthly (day N, or last day)**, **weekly**, **every 2 weeks**, **every N months**, **yearly**; start date; optional end date or number of payments.
- **Per-occurrence overrides:** skip one, move one's date, change one's amount, mark one as paid.
- Screen: list grouped by income and costs, with monthly totals; add and edit forms.

### 3. One-time items (the month tabs, without copying tabs)
- Income or spend; date (past or planned future); description; category; amount; note.
- Screen: month view (swipe between months) listing recurring occurrences and one-time items for that month, with paid and planned states.

### 4. Dashboard (the spreadsheet's Dashboard, improved)
- **This month:** total income, recurring costs, one-time costs, total spend, free money, spent as % of income.
- **Year:** month-by-month table (income, spend, free money, running total of free money), year totals, average monthly spend, highest-spend month.
- **Spending by category** for the selected month and the year.
- **Forecast card:** projected balance chart, lowest balance and its date, and the next 3 alerts.
- New months and years appear automatically; there are no tabs to copy.

### 5. Forecast
- **Daily for the next 60 days, monthly for the next 24 months**, from the starting balance plus every recurring occurrence (with overrides), planned one-time items, debt payments, card repayments and cheques.
- Shows the lowest balance and its date, end-of-month balances, the debt-free date and total remaining debt.
- A pure TypeScript engine (`src/engine/`) with no React or storage dependencies, fully unit-tested.

### 6. Debts module
- **Loans:** lender label (free text), remaining balance, monthly payment, interest rate (optional, informational), payment day, end date (or computed from the payments).
- **Credit cards:** name (free text, no bank logos), limit, current balance, statement day, due day, minimum payment rule (percentage with a floor, set by the user), monthly interest rate (user-entered), and a repayment plan (pay in full / minimum / fixed amount) that drives the forecast. Shows **available = limit − balance** and usage.
- **Instalment plans** (0% card plans and buy-now-pay-later): total, monthly amount, months left, linked card (optional), end date. Payments are generated automatically and their dates can be edited.
- Payment log with **partial and extra payments**.
- Screen: debts list with total remaining, monthly debt payments, debt-to-income %, and the debt-free date.

### 7. Cheques module
- Payee (free text), amount, date, purpose (rent and so on), status (upcoming / cleared / cancelled), with a series helper ("4 cheques, every 3 months, starting …").
- Shown in the month view and the forecast; alerts if the projected balance on a cheque date is below the cheque amount.

### 8. Alerts module (local notifications, scheduled from the forecast)
- **Shortfall:** the projected balance drops below zero, or below the buffer, with the date and amount ("On 14 Mar your balance is projected at −AED 1,240").
- **Debt payments vs income:** monthly debt payments above a chosen share of income. Defaults are 40% (caution) and 50% (high). The UAE Central Bank's personal-loan rules use 50% of salary as a limit; this must be verified before release, and the alert is phrased as a fact, not advice.
- **Card near limit:** usage above a chosen percentage (default 80%).
- **Uncovered cheque:** the balance on a cheque date is below its amount.
- **Minimum-only interest:** when a card's plan is "minimum", shows the estimated interest for the month from the user's rate.
- **Good news:** a loan or plan ends, freeing up money.
- Notifications are rescheduled whenever data changes. In-app alert list on the dashboard. Permission is asked in context, with an explanation first.
- Wording states facts, never advice ("you should…" is not allowed).

### 9. Statement import module
- **Sources:** a CSV file; an OFX/QFX file; a PDF statement (text read on the device); and a photo or scanned PDF read with **free on-device OCR** (Google ML Kit on Android, Apple Vision on iOS, via `expo-text-extractor` or `@react-native-ml-kit/text-recognition`; chosen in a spike). Files never leave the phone.
- **Parser:** finds transaction lines (date, description, amount, debit or credit) in AED, using common UAE statement formats (DD/MM/YYYY, DD MMM YYYY, "Cr/Dr", "AED 1,234.50"). Remembers the column or line layout per statement source (user-named, no bank names built in).
- **Review screen:** every row is editable before saving (date, description, amount, direction, category); suggested categories from saved rules ("description contains X → category Y"); likely duplicates flagged; transfers between own accounts can be excluded; "import selected".
- Imported rows become one-time items marked "imported", and are counted in the dashboard and forecast.

### 10. Settings and data safety
- Module switches, currency label, payday, buffer, alert thresholds, categories (the 15 defaults are editable: Housing, Utilities & Bills, Transport & Car, Groceries, Dining & Coffee, Insurance, Subscriptions, Health, Shopping, Entertainment & Travel, Loans & Credit Cards, Family & Gifts, Education, Savings & Investments, Other).
- **Backup and restore** to a file (export via the share sheet, restore via the file picker, with the backup checked before it replaces anything), **CSV export** of transactions, **biometric/PIN lock** (`expo-local-authentication`), and delete all data.
- About screen: the "tracking only, not financial advice" note, and the privacy policy link.

### 11. Pro unlock (one-time purchase)
- Free core: up to 10 recurring items, 2 debts, 2 cheques and 2 statement imports per month; everything else is included.
- Pro (one-time, about AED 29-49, set in the store consoles; final price is the developer's call): no limits. No ads, ever, and no subscription.
- `react-native-purchases` (RevenueCat, free until revenue is meaningful) behind `src/lib/purchases.ts`, with product IDs as constants and the API key as a clearly named constant for the developer to fill in at release. Includes a "Restore purchases" button. Until a key is set, the app runs with the free limits, and the upgrade screen says Pro isn't available in this build (so there's no dead button).

### 12. Look, appearance and profiles (2026 redesign, during milestone 1)
- **Look:** "Bold cards + Glass fintech" — see `design/redesign-2026.png` (and `design/redesign-2026.html`). Every screen has a soft aurora background (three blurred colour blobs), frosted glass cards with a hairline border, large rounded corners (18-28), bold numbers, colourful icon tiles. The dashboard opens with a greeting and the profile button, then a gradient **hero card** (balance today, lowest point in the next 60 days, glowing forecast line with the buffer as a dashed line), three **stat tiles** (Income, Spent, Free this month, each with a coloured icon), the **buffer alert** when the forecast dips under the buffer or zero, and **Coming up** (the next payments and income with "in N days" and instalment progress such as "14 of 48 paid"). Tokens live in `src/constants/theme.ts`.
- **Light and dark:** both are designed (pastel aurora and white glass in light; deep navy aurora, translucent glass and neon accents in dark). **Settings → Appearance: System / Light / Dark**, saved on the device; native parts (date picker, alerts, tab bar, status bar) follow it.
- **Profiles on one phone:** for a partner or a shared household budget. The profile button (avatar + name ▾) on the dashboard opens the **profile switcher** sheet: the list of profiles (avatar, name, tick on the open one), **Add profile**, **Manage profiles**, and the Appearance switch. Each profile has completely separate data (its own plan, one-time items, categories and settings, and its own backup, export and "delete all data"), stored in its own database. A new profile starts with the setup wizard. Profiles: up to 6, names 1-24 characters, a colour for the avatar; rename, recolour and delete (with a typed confirmation; the open profile and the last profile can't be deleted). Existing data becomes the first profile, "Me". No sign-in and no sync: everything stays on the phone. A per-profile PIN or Face ID lock comes with the lock in milestone 2.
- **No money accounts** (bank, card, cash balances): the developer decided against them; the forecast keeps a single starting balance per profile.

### 13. Reports (quarterly and yearly, Pro)
Company-style reports for a person, so they can track how they're doing and see where to improve (facts only, never advice).
- **Periods:** each calendar quarter (Q1-Q4) and each year; the current period is "so far".
- **Summary:** income, spending, saved (income − spending) and savings rate, each vs the previous quarter and the same quarter last year (▲/▼ %).
- **Income statement:** income by source and spending by category, with the change vs the previous period.
- **Cash flow:** balance at the start and end, and what moved it (salary, recurring costs, one-time items, debt payments, cheques).
- **Debts:** owed at the start and end, paid off, estimated interest, debt-to-income % trend, debt-free date then vs now.
- **Key figures:** savings rate, debt-to-income, spending as % of income, biggest category, fixed vs flexible costs, months of buffer.
- **Highlights:** up to 5 factual lines, e.g. "Dining rose 32% vs Q2 (+AED 840)", "Car loan: 9 payments left".
- **Year in review** (yearly report): the 4 quarters side by side and the best and worst month.
- **Where:** a Reports card on Home → list of periods → report screen; **PDF** save/share with `expo-print` + `expo-sharing` (free).
- **Pro only** (developer's decision): everything in Reports needs the one-time Pro unlock. Free users see a Reports card that opens a **sample report** built from demo numbers (clearly labelled "Sample"), so they can see what they get before buying — never their own figures.
- Reports use the data in the app (plan + recorded items); after statement import (milestone 3) they reflect real transactions.

## Data model (SQLite via `expo-sqlite`, money in integer fils)

- `settings` (key/value): currency, payday, buffer, thresholds, enabled modules, onboarding done, lock enabled
- `categories` (id, name, kind income|cost, sort, archived)
- `recurring_items` (id, kind, name, category_id, amount_fils, schedule JSON, start_date, end_date, count, note)
- `occurrence_overrides` (id, recurring_id, original_date, action skip|move|amount|paid, new_date, new_amount_fils)
- `transactions` (id, kind, date, description, category_id, amount_fils, note, source manual|import, import_id, planned bool)
- `debts` (id, type loan|card|plan, name, fields JSON, created_at)
- `debt_payments` (id, debt_id, date, amount_fils, kind regular|extra|partial)
- `cheques` (id, payee, amount_fils, date, purpose, status)
- `imports` (id, source_name, file_type, imported_at, row_count), `import_templates` (source_name, layout JSON), `category_rules` (pattern, category_id)

Storage is behind a repository interface (`src/data/`), with an in-memory version for tests. Dates are local calendar dates (`YYYY-MM-DD`), with the time zone fixed to the device. All money maths uses integers.

## Data the app collects

Nothing leaves the device: no account, no analytics, no ads, no network calls except the purchase SDK talking to the stores when Pro is bought. Financial data is stored only on the phone. Store privacy answers: **Data not collected** (on-device only), except purchase history handled by Apple/Google and RevenueCat. This is to be confirmed by QC against the code.

## Store notes

- Google Play **Financial features declaration**: personal finance management with no financial services (no lending, payments or credit scores).
- "Tracking only, not financial advice" shown in the app and the listing. No bank or provider names or logos.
- Age rating: 4+ / Everyone (no user-generated content shared, no ads).
- `ios.privacyManifests`: UserDefaults (`CA92.1`), plus file timestamp and disk space reasons if libraries need them.

## Milestones and tasks

Each milestone ends with a working, tested app: code review, the test engineer's full run, and an Android test build on GitHub Actions with Maestro flows. "Owns" lists the files each parallel task may edit; the lead owns `package.json`, `app.json`, `src/theme/`, `src/types/`, `src/data/schema.ts`, `src/data/repository.ts` (the interface) and `app/_layout.tsx`.

### Milestone 1 — Core planner (no native code; runs in Expo Go and on the web)
| Task | Owns |
| --- | --- |
| Lead: scaffold, theme, types, schema, repository interface, navigation (tabs: Dashboard, Month, Plan, Settings) | shared files above |
| T1 Engine: schedules (all recurrence kinds, overrides), month and year summaries, category totals, daily and monthly forecast | `src/engine/**` |
| T2 Data: SQLite repository + in-memory repository + migrations + backup/restore and CSV export serialisers | `src/data/sqlite/**`, `src/data/memory/**`, `src/data/backup/**` |
| T3 Recurring items and one-time items screens and forms | `app/(tabs)/plan/**`, `src/features/items/**` |
| T4 Month view and Dashboard (summary, year table, categories, forecast chart) | `app/(tabs)/index.tsx`, `app/(tabs)/month/**`, `src/features/dashboard/**`, `src/components/charts/**` |
| T5 Setup wizard and Settings (modules, categories, payday, buffer, backup/restore/export, delete all) | `app/onboarding/**`, `app/(tabs)/settings/**`, `src/features/settings/**` |

### Milestone 2 — Debts, cheques, alerts, lock
| Task | Owns |
| --- | --- |
| T6 Engine: loans, cards (minimum rule, plan, interest estimate), instalment plans, cheques in the forecast; debt-to-income, utilisation, debt-free date; alert rules; debts and cheques in the month view and Coming up | `src/engine/**`, `src/features/dashboard/month-items.ts`, `src/features/dashboard/upcoming.ts` |
| T7 Debts screens (list, loan/card/plan forms, payment log) | `app/debts/**`, `src/features/debts/**` |
| T8 Cheques screens (list, series helper) | `app/cheques/**`, `src/features/cheques/**` |
| T9 Notifications scheduler, in-app alert list, permission explainer, biometric/PIN lock | `src/features/alerts/**`, `src/features/lock/**`, `src/app/lock*.tsx`, `src/app/(tabs)/settings.tsx` |
| D Data: debts/payments/overrides/cheques in the SQLite and memory repositories, schema v2 migration test, backup v2 (v1 still restores), CSV export rows | `src/data/sqlite/**`, `src/data/memory/**`, `src/data/backup/**` |

### Milestone 2 decisions (lead)
- **Where things live:** Debts and Cheques are separate screens (`/debts`, `/cheques`) opened from cards on the Plan tab (and the dashboard's Coming up / alerts). The 4-tab bar stays as it is for one-handed use.
- **Forecast:** loan payments (monthly on the payment day until the balance or end date is reached), card payments on the due day by plan (full: the statement balance; minimum: the minimum rule; fixed: the amount, capped at the balance), instalment plan payments (plans linked to a card are paid as part of that card), and upcoming cheques all count as outflows in the forecast, the month view, Coming up and the dashboard. Cleared and cancelled cheques don't count. Logged payments (the payment log) reduce balances; a logged regular payment replaces that month's scheduled one.
- **Alerts** are computed from the forecast for the open profile only and shown in an in-app list on the dashboard. Local notifications are scheduled for the open profile (at 09:00 local time on `notifyOn`), rescheduled after every change, and cleared when switching profiles. When the profile has a lock, the notification text is generic ("A payment needs attention in Money Planner") so amounts never show on the lock screen. Permission is asked only after the explainer, when the user turns Alerts on.
- **Lock (per profile):** a 4-6 digit PIN, with Face ID / fingerprint as a shortcut when the phone has it. The PIN is never stored: a salted SHA-256 hash is kept in the phone's secure storage (`expo-secure-store`) under the profile's id. Opening a locked profile (at launch, after switching, or after the app was in the background for over 60 seconds) shows the lock screen. Forgetting the PIN: the only way in is deleting that profile's data from the lock screen (typed confirmation), so other people's data is never exposed; the lock screen says so up front.
- **Modules:** Debts, Cheques and Alerts switches appear in the wizard and Settings once built (`AVAILABLE_MODULES`). Turning a module off hides its data everywhere but keeps it.
- Backup files are version 2 (debts, payments, schedule changes, cheques); version 1 files still restore.

### Milestone 3 decisions (developer, 2026-11-22; research in research/milestone3-import.md)
- **Ship:** import by **sharing into the app** (PDF statements incl. password-protected ones, photos/screenshots of statements and receipts, Excel/CSV, OFX/QFX, and the text of a bank SMS shared from the Messages app), plus "Import" in the app with a file picker and the camera. On-device only: `expo-text-extractor` (Apple Vision / ML Kit, model downloaded at install via a config plugin), `expo-pdf-text-extract` for text PDFs, `react-native-pdf-thumbnail` to OCR scanned PDFs; review screen before anything is saved; duplicate detection and category rules.
- **Not in v1:** automatic reading of SMS (Google Play's SMS permission is case-by-case and risky for a personal account) and of notifications (Android restricted settings, needs our own native module; impossible on iPhone). Revisit automatic Android notification capture after the app is approved on Google Play. The spec's "live SMS/notification capture" is replaced by share-in (two taps, both phones).
### Milestone 3 — Statement import and OCR (native code; needs a development build)
| Task | Owns |
| --- | --- |
| T10 Parsers: CSV (column mapper), OFX/QFX, statement text → transactions (UAE date and amount formats, Cr/Dr), layout templates, duplicate detection, category rules | `src/import/parse/**` |
| T11 PDF text extraction on the device (bundled pdf.js in a WebView, offline) | `src/import/pdf/**` |
| T12 OCR spike and integration (`expo-text-extractor` vs `@react-native-ml-kit/text-recognition`), image picker and camera capture, with a mock for Jest and Expo Go | `src/import/ocr/**`, `modules/**` if a local module is needed |
| T13 Import flow and review screen (source picker, preview, edit, rules, duplicates, import selected) | `app/import/**`, `src/features/import/**` |

### Milestone 4 — Pro unlock, store material, QC, release prep
| Task | Owns |
| --- | --- |
| T14 Purchases module, limits, upgrade screen, restore purchases | `src/lib/purchases.ts`, `src/features/pro/**` |
| Lead: icon, store listing, privacy policy, support page, privacy manifest, QC, test build, REPORT.md | `store/**`, `assets/**`, `REPORT.md` |

### Redesign and profiles (during milestone 1)
| Task | Owns |
| --- | --- |
| Lead: tokens, profile types and provider, root and tab layouts | `src/constants/theme.ts`, `src/data/profiles/types.ts`, `src/data/profiles/ProfileProvider.tsx`, `src/data/repository.ts`, `src/data/create-repository*.ts`, `src/hooks/**`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx` |
| R1 Profile stores (SQLite + memory), repository `close()` and database name | `src/data/sqlite/**`, `src/data/memory/**`, `src/data/profiles/*-profile-store.ts` |
| R2 UI kit and charts restyle, new pieces (aurora, glass, hero, stat tile, sheet, avatar) | `src/components/**` |
| R3 Dashboard redesign | `src/app/(tabs)/index.tsx`, `src/features/dashboard/**` |
| R4 Month, Plan, item forms and Categories restyle | `src/app/(tabs)/month.tsx`, `src/app/(tabs)/plan.tsx`, `src/app/recurring/**`, `src/app/transaction/**`, `src/app/categories.tsx`, `src/features/items/**` |
| R5 Profile switcher, Manage profiles, Appearance, Settings and wizard restyle | `src/features/profiles/**`, `src/app/profiles.tsx`, `src/app/(tabs)/settings.tsx`, `src/features/settings/**`, `src/app/onboarding.tsx` |

## Testing

- **Unit:** the engine (every recurrence kind, overrides, month-end and leap years, debt maths, alert rules), parsers (fixture statements in several layouts, with personal data removed), repositories, backup round-trips.
- **Render tests:** at least one per screen, including empty states.
- **Maestro** (`.maestro/`, `appId: com.shefoo.moneyplanner`): first launch and setup; add salary and rent and see the forecast; add a card and an instalment plan and see the debt-to-income figure; import a CSV and confirm rows; backup and restore.
- **Real-device checks:** OCR and notifications on Android (APK from GitHub Actions), and on iPhone via TestFlight at release.
