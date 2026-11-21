# Similar ideas: modular personal finance forecast app (UAE first)

*Researched 2026-11-21 with `/similar-ideas`. Three scouts (direct competitors, category leaders, neighbouring audiences) plus the lead's own checks. Store numbers are **verified** with `scripts/store-lookup.mjs` (App Store `ae` and `us`, Google Play `ae`; Android installs are global; App Store rating counts are per country). Anything marked *estimate* is not.*

## The seed

An app for **salaried individuals in the UAE who run their money in a spreadsheet**. It replaces a monthly budget workbook made of three parts: a setup sheet of recurring income and costs with start and end dates, one tab per month for one-time items, and a dashboard showing free money, year totals and category spend. The app adds what a spreadsheet can't do:
- loans, instalment plans and credit cards tracked with balances and end dates;
- statement import with on-device OCR;
- a forecast of the user's current and future position;
- alerts before a shortfall or too much debt;
- modules the user turns on as needed.

**Store category:** Finance.

**What the spreadsheet route shows a user wants:** a set-up-once recurring list, a monthly view, a "free money" figure, category totals, and the year at a glance. **What it can't do:** roll into new months or years without manual copying, track debt balances, look ahead past the current year, warn the user, or read statements.

## Competitor map

| App | Store data (verified) | Price model | What it is |
| --- | --- | --- | --- |
| Money Manager Expense & Budget (Realbyte) | Android 4.6, 469,955 ratings, 10M+; iOS 4.8 (us 19,998, ae 3,316) | Free + ads, premium AED 8.99–78.99 | Offline manual ledger, budgets, recurring entries |
| Money manager & expenses (innim) | Android 4.8, 494,465, 10M+ | Free + IAP AED 7.49–164.99 | Manual expense tracker |
| Wallet (BudgetBakers) | Android 4.7, 389,363, 10M+ | Free + IAP up to AED 529.99 | Bank sync, budgets, multi-currency |
| Money Tracker (freeman) | Android 4.9, 337,311, 5M+ | Free + IAP AED 11.99–149 | Manual tracking, budgets |
| Money Lover | Android 4.4, 208,329, 5M+ | Free + premium | Wallets, budgets, recurring events, sign-up required |
| Rocket Money | iOS us 4.5, 409,540; Android 142,177, 10M+ | Free + premium (~$15/mo per a review, *estimate*) | US bank linking, subscriptions |
| Monarch | iOS us 4.9, 119,383 | Subscription, no free trial (per reviews) | US bank sync, net worth |
| YNAB | iOS us 4.8, 62,260 | Subscription | Zero-based budgeting |
| EveryDollar | iOS us 4.7, 84,272 | Free + paid | Zero-based, paycheck planning |
| TimelyBills | Android 4.5, 37,233, 1M+ | Freemium up to AED 249.99 | Bill reminders, budgets, bank sync |
| Debt Payoff Planner & Tracker | iOS us 4.7, 7,439; Android 4.5, 4,767, 500K+ | Freemium, AED 25.99–159.99 | Snowball/avalanche payoff (free tier capped at 10 debts) |
| Beyond Budget | Android 4.4–4.6, 2,748, 100K+ | Trial, then paid | Envelope budget, bank import |
| **Money Forecast: CashFlow** | **iOS us 4.3, 77** | Subscription wall | Recurring items and balance forecast |
| CashFlowCast, Nevo Money, Webasyst Cash Flow, Bill Budget Calendar Forecast | 1–21 ratings each; Android 2.1 for one | Mostly trials | Newer forecast apps |
| Instalment, cheque, BNPL and salary-planner apps (PayTrack, ChequeMate, Salary Planner and others) | 0–5 ratings each | Free or tiny | UAE and GCC niche trackers, all brand-new |
| Statement converters (PDF to Excel) | 4.5, 270, 10K+ | IAP up to AED 229.99 | Conversion only, no budgeting |

**Reading of the map:** general expense tracking is very crowded, with more than ten apps at 1M–10M+ installs. **Forecasting, loan and instalment timelines, and statement import are nearly empty**: the forecast apps have tens of ratings and are buggy or paywalled, and the debt apps are US-style payoff tools. No UAE-specific forecast or instalment app has traction.

### Feature matrix

| Feature | Money Manager | Wallet | Money Lover | Rocket Money | YNAB | Debt Payoff Planner | Money Forecast | **Proposed app** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recurring items with start/end dates | Partly | Partly | Yes | Bills only | Yes | No | Yes | **Yes, with per-occurrence overrides** |
| Loans and instalments with balance and end date | No | Basic debts | No (users ask) | No | Partly | Payoff only | No | **Yes** |
| Credit cards with limit, outstanding and available | No (users ask) | Partly | No | No | Partly | Balance only | No | **Yes** |
| Future balance forecast (months ahead) | No | No | No | Payday view (removed, *per reviews*) | No | Payoff date | Yes | **Yes, daily and monthly** |
| Shortfall and debt-ratio alerts | No | No | No | No | No | No | Partly | **Yes** |
| Statement import, no bank login | Backup only | Bank sync | Bank sync | Bank sync | Bank sync | No | No | **CSV now, OCR next** |
| Works fully offline, no account | Yes | No | No | No | No | Yes | Yes | **Yes** |
| No ads, no subscription | No | No | No | No | No | No | No | **Yes (one-time unlock)** |
| UAE specifics (AED, post-dated cheques, card instalment plans, salary day) | No | Currency only | No | No | No | No | No | **Yes** |

## What users love and hate

**Loved:**
- Simple, fast manual entry.
- No sign-in: "I'd rather keep my stuff offline" ([Money Manager, Android](https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree)).
- "Functional and free, slightly more convenient than a spreadsheet" ([Money Manager, iOS](https://apps.apple.com/us/app/id560481810)), which is this app's exact positioning.
- Reminders that keep people on track.
- Rocket Money's Payday view, "the one useful tool to estimate how much money would be left in your account after bills" (users complained when it was removed) ([Rocket Money](https://apps.apple.com/us/app/id1130616675)).

**Hated:**
1. **Paywalls, subscriptions and bait-and-switch.**
   - "Blocked by a paywall. Can't even try out the app" ([Monarch](https://apps.apple.com/us/app/id1459319842)).
   - "Immediate subscription required to take a look" ([Money Forecast](https://apps.apple.com/us/app/id1030505828)).
   - "most basic free features are now paid subscriptions" ([TimelyBills](https://play.google.com/store/apps/details?id=in.usefulapp.timelybills)).
   - "can't add additional debt over 10" ([Debt Payoff Planner](https://play.google.com/store/apps/details?id=com.oxbowsoft.debtplanner)).
   - Ads "now 5 minutes long" (Money Manager).
2. **Bank sync that fails, especially outside the US.**
   - "Bank Auto Sync does not work most of time. Buy it if you are happy with manual entry" ([Wallet](https://play.google.com/store/apps/details?id=com.droid4you.application.wallet)).
   - "not working well in Kuwait" ([Beyond Budget](https://play.google.com/store/apps/details?id=com.beyondbudget)).
   - Transfers counted twice.
3. **Data loss.**
   - "Updating wiped all my data" (Money Manager, iOS).
   - "I've lost years of data" (Checkbook).
   - Lifetime purchases lost or charged again (Money Lover, Debt Payoff Planner).
4. **Rigid recurring schedules.**
   - "No bi-weekly income selection", and no way to move one occurrence's date (Money Forecast).
   - No partial or extra payments (Debt Payoff Planner).
   - Recurring items that "duplicate and multiply" (Checkbook).
5. **Missing card and instalment features.**
   - "0% installment options (3/6/10 mos) with auto-generated entries and editable bill dates" and a "Pay Bill" button ([Money Lover, ae](https://play.google.com/store/apps/details?id=com.bookmark.money)).
   - A credit limit with outstanding and available balance (Money Manager users).
6. **Poor OCR.**
   - "receipt scanner has been complete garbage"; it read only the tax line instead of the total.
   - Paywalled on the first scan ([Easy Expense](https://play.google.com/store/apps/details?id=com.easyexpense)).
7. **Multi-currency breakage.** "after the default currency change the whole app is useless" (Money Tracker).

## Variations, ranked

Scores run from 1 to 5; for policy risk, 5 means low risk.

| # | Variation | Demand | Gap | Buildability | Differentiation | Monetization fit | Policy risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Forward planner: recurring items + loans, cards and instalments + forecast and alerts** | 4 | 4 | 4 | 4 | 4 | 4 | **24** |
| 2 | UAE cheque and instalment calendar (post-dated cheques, card plans, BNPL as dated outflows) | 2 | 4 | 5 | 5 | 3 | 4 | 23 |
| 3 | The full seed: every module including OCR in v1 | 4 | 4 | 2 | 4 | 4 | 4 | 22 |
| 4 | Salary-to-salary pay-cycle planner (lowest balance before next payday) | 3 | 3 | 5 | 3 | 3 | 5 | 22 |
| 5 | Offline statement importer (CSV, PDF and photo OCR into categorised monthly totals) | 3 | 4 | 2 | 4 | 3 | 4 | 20 |
| 6 | No-ads, never-lose-data local money manager | 4 | 2 | 4 | 2 | 3 | 5 | 20 |
| 7 | End-of-month cash-flow view only | 3 | 3 | 5 | 2 | 2 | 5 | 20 |
| 8 | Multi-currency family-support planner (money sent home, school fees) | 2 | 3 | 4 | 4 | 2 | 3 | 18 |

None scored 1 on anything. All three scouts independently recommended building #1, adding #2's UAE features to it, and adding #5's import as the next milestone.

## Top 3

### 1. Forward planner (recommended)

**Idea:** for salaried UAE residents, a private, offline planner that shows where their money will be in each coming month. It covers recurring income and costs, loans, credit cards and 0% instalment plans with balances and end dates, and it warns before a shortfall or when debt payments take too much of their salary.

**Evidence:**
- The market leaders are expense logs with 10M+ installs, but none forecasts or tracks instalments.
- Users of two of the leaders ask for exactly this (Money Lover: instalment plans; Money Manager: card limits).
- The forecast-only apps are tiny (Money Forecast has 77 ratings) and paywalled.
- Bank sync fails in the Gulf, so a manual-first app with good import isn't a disadvantage there.

**How it differs:** it is forward-looking rather than a log, and debt- and date-aware. It handles messy schedules: weekly, bi-weekly, monthly, yearly, start and end dates, moving or changing one occurrence, and partial or extra payments. It is offline with no account, sold as a one-time unlock, and has backups that are tested.

**v1 features (milestone 1):**
1. Recurring income and costs with flexible schedules, start and end dates, and per-occurrence overrides. This imports the spreadsheet's Setup sheet idea: set up once and it rolls forward forever.
2. Loans, credit cards (limit, outstanding, available, due date, minimum payment) and instalment plans (amount, months left, end date), with partial and extra payments.
3. A forecast: 60 days day by day and 12+ months month by month, showing free money, lowest balance and the debt-free date.
4. Alerts: a projected shortfall, debt payments above a chosen share of salary (default 50%, the UAE Central Bank's personal-loan limit, *to verify*), a card near its limit, and a post-dated cheque date not covered.
5. One-time income and spends, plus category totals: the spreadsheet's month tabs and dashboard, without copying tabs.
6. Backup and restore to a file, plus CSV export, so data is never lost.

**Monetization:** a generous free tier (for example 10 recurring items and 2 debts), then a **one-time unlock** of around AED 29–49 (*estimate*). No ads and no subscription, which answers the top complaint in the category.

**Risks:**
- Users must type in data until import exists, so make entry fast and start with a setup wizard.
- Alerts must state facts, not advice.
- Google Play Financial features declaration: "no financial services".

**Later milestones:** statement import (CSV with column mapping first, then on-device OCR for PDFs and photos, with a review screen), then live capture of bank SMS and notifications.

```
/new-app "Forward planner for salaried UAE residents: a private, offline app that replaces a monthly budget spreadsheet and shows where your money will be in each coming month. Recurring income and costs with flexible schedules (weekly, bi-weekly, monthly, yearly), start/end dates and per-occurrence overrides; loans, credit cards (limit, outstanding, available, due date, minimum) and 0% instalment plans with balances, partial/extra payments and end dates; post-dated cheques; one-time income and spends with category totals. Forecast 60 days daily and 12+ months monthly (free money, lowest balance, debt-free date), with local alerts before a shortfall, an uncovered cheque, a card near its limit, or debt payments above a chosen share of salary (default 50%). Backup/restore and CSV export so data is never lost. AED first, English. Facts not advice; no bank login, no servers, no ads. Milestones: 1) planner, forecast and alerts; 2) statement import (CSV with column mapping, then free on-device OCR for PDFs and photos with a review screen); 3) live capture of bank SMS and notifications." com.<developer>.forwardplanner "free core (10 recurring items, 2 debts), one-time pro unlock"
```

### 2. UAE cheque and instalment calendar

**Idea:** for UAE renters and card users, one calendar of every committed future payment: post-dated rent cheques, card instalment plans, buy-now-pay-later plans and loans. It shows "committed money" per month and a reminder before each due date.

**Evidence:** every search for cheque, instalment, BNPL or salary planner returned only brand-new apps with 0–5 ratings. That means no entrenched competitor, but also unproven demand (*estimate*).

**How it differs:** it treats cheques and instalments as dated future outflows with a status, not as checkbook entries.

**v1:**
1. Cheque schedule.
2. Instalment plans with months left.
3. Card limits with a usage alert.
4. A month-by-month committed-money view.
5. Reminders.

**Monetization:** free for up to 3 plans, then a one-time unlock. **Risks:** a small audience. It works better as a module inside #1 than as its own app.

```
/new-app "UAE cheque and instalment calendar: track post-dated rent cheques, card instalment plans, buy-now-pay-later plans and loans as dated future payments, see committed money per month against salary, and get reminders before each due date. Offline, AED, facts not advice, no provider names." com.<developer>.chequecalendar "free up to 3 plans, one-time unlock"
```

### 3. The full seed with OCR in v1

**Idea:** your original idea: all modules plus statement OCR from day one.

**Evidence:** the same demand as #1, and bank-statement converters sell at up to AED 229.99 with 10K+ installs.

**Why it ranks third:** buildability. Free on-device OCR needs native code, which can't run in Expo Go and has to be tested through cloud builds. Every UAE bank's statement layout needs its own testing. Putting it in v1 delays launch and risks shipping a weak scanner, the category's most-hated feature. Ship it as #1's second milestone instead.

```
/new-app "Modular personal finance app for UAE residents that replaces a budget spreadsheet: recurring income and costs, one-time items, loans, cards and instalments with balances and end dates, statement import with free on-device OCR and a review screen, a month-by-month forecast of income, spending and balance, and alerts before a shortfall or too much debt; users switch modules on as needed. Offline, AED, facts not advice." com.<developer>.moneyplanner "free core, one-time pro unlock"
```

## Recommendation

Your idea is worth building. The gap is real: forward planning with loans, cards and instalments is almost unserved, while the big apps are expense logs with paywalls and ads.

Build it as **#1, the forward planner**, with the UAE features from #2 included. Put **statement import, then OCR, as milestones 2 and 3** rather than in v1. That gets a solid, differentiated app out sooner, and makes sure the OCR is done well when it ships.

The biggest risks:
- Manual entry fatigue before import exists, so make entry fast and add a setup wizard.
- Unproven demand for the UAE-specific features, so test them with real users during Google Play's 14-day closed test.
