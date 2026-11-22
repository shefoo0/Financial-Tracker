# What users love in finance apps, and what Money Planner still has to match

*Researched 2026-11-22. Angle: 5-star reviews only. Everything marked **verified** comes from `node scripts/store-lookup.mjs` (reviews `--min-stars 5`, App Store `us` and `ae`, Google Play `us` and `ae`) or its search output. Keyword counts are regex counts over the fetched reviews: **verified as counts, but approximate as meaning** (they include non-English reviews, and a word can match without being praise). Treat them as lower bounds for themes and as rough ratios. Anything else is marked *estimate*.*

## Method and sample

- Reviews fetched (verified): **1,719 unique 5-star reviews**, from the 130-150 most recent per app and storefront. Android reviews are global, so `ae` and `us` are identical. Monarch `ae` returned 0. Around 120 of the longest English reviews were read in full.
- Apps and IDs (verified, search output of 2026-11-22):

| App | Store ID | Rating (count) | Reviews read |
| --- | --- | --- | --- |
| Money Manager Expense & Budget (Realbyte) | iOS 560481810; Android com.realbyteapps.moneymanagerfree | iOS 4.8 (20,003 us); Android 4.6 (470,012) | iOS us + ae, Android |
| Money Lover | iOS 486312413; Android com.bookmark.money | iOS 4.6 (2,284); Android 4.2 (208,325) | both |
| Wallet (BudgetBakers) | iOS 1032467659; Android com.droid4you.application.wallet | iOS 4.6 (5,943); Android 4.6 (389,392) | both |
| Money Tracker (freeman) | Android com.freeman.moneymanager; iOS "Budget app - spending tracker" 1525179720 | Android 4.8 (337,465); iOS 4.7 (16,411) | both |
| Monarch | iOS 1459319842 | 4.9 (119,471) | iOS us |
| YNAB | iOS 1010865877 | 4.8 (62,270) | iOS us |
| EveryDollar | iOS 942571931 | 4.7 (84,273) | iOS us |
| Rocket Money | iOS 1130616675 | 4.5 (409,631) | iOS us |
| Copilot | iOS 1447330651 | 4.8 (31,103) | iOS us |
| Debt Payoff Planner & Tracker | iOS 1009323715; Android com.oxbowsoft.debtplanner | iOS 4.7 (7,440); Android 4.5 (4,767) | both |
| TimelyBills | Android in.usefulapp.timelybills; iOS "Bill Organizer Budget Planner" 1454624499 | Android 4.5 (37,237); iOS 4.6 (1,106) | both |
| Money Forecast: CashFlow | iOS 1030505828 | 4.3 (77) | iOS us (about 16 reviews, all) |

Store pages: <https://apps.apple.com/us/app/id560481810>, <https://play.google.com/store/apps/details?id=com.realbyteapps.moneymanagerfree>, <https://apps.apple.com/us/app/id486312413>, <https://play.google.com/store/apps/details?id=com.bookmark.money>, <https://play.google.com/store/apps/details?id=com.droid4you.application.wallet>, <https://play.google.com/store/apps/details?id=com.freeman.moneymanager>, <https://apps.apple.com/us/app/id1459319842>, <https://apps.apple.com/us/app/id1010865877>, <https://apps.apple.com/us/app/id942571931>, <https://apps.apple.com/us/app/id1130616675>, <https://apps.apple.com/us/app/id1447330651>, <https://apps.apple.com/us/app/id1009323715>, <https://play.google.com/store/apps/details?id=in.usefulapp.timelybills>, <https://apps.apple.com/us/app/id1030505828>.

Caveats: the two big manual trackers (Money Manager, Money Tracker) dominate the useful signal for our audience. Monarch, Copilot and Rocket Money love is mostly bank sync and AI, which we deliberately don't have. Money Forecast is tiny (77 ratings), but its handful of reviews are the closest to our idea.

## 1. What people praise again and again

Counts are verified regex hits over the 1,719 reviews; percent is of 1,719.

| Quality | Hits | Typical quote (all 5-star) |
| --- | --- | --- |
| Simple, easy, intuitive | 283 (16%) | "Easy, super user friendly and you can filter with different things." (Money Manager iOS, 2026-11-01) |
| Customisable, categories | 70 category hits, 24 "customi*" | "Highly customizable. Very easy UX." (Money Tracker Android, 2026-11-14) |
| Design, clean look | about 100 (loose) | "a neat place to rest... of ads, loadings, clutter" (Wallet iOS, 2025-12-05); "Liquid Glass design" (Money Lover iOS) |
| Quick entry | 55 | "categorizing expenses takes seconds" (Money Tracker iOS, 2026-11-18); "I like the budget cards. I find it makes it quicker to enter a transaction" |
| Charts, reports, statistics | 67 | "The graphs and visualizations... I found the visuals to be really motivating" (Debt Payoff iOS, 2026-02-10) |
| Reminders and notifications | 39 | "I love how it remind me a couple days before my due... of an upcoming bill" (TimelyBills iOS, 2022-10-19); "the app reminds me during the evenings" (Money Manager) |
| Support that answers | 43 | "they always responds to your messages" (Money Lover iOS); "Phenomenal Support Team" (YNAB); "you can talk to a real person" (Copilot) |
| One-time price, no subscription | 33 | "Hooray for a budget app that doesn't require a subscription!" (Money Tracker iOS, 2026-10-27); "i love the fact that its a one time payment" (Money Manager ae, 2024-09-28) |
| No or light ads, free | 18 explicit ad praise; "free" 92 | "no ads, perfect home screen widgets and FREE!!" (Money Manager Android, 2026-11-07) |
| Manual, no bank link, local data | 32 | "I didn't want to link any of my bank accounts. I just wanted to manually put in my paychecks, bills" (Money Tracker iOS, 2026-08-28); "stores data locally so trustworthy" (Money Manager Android, 2026-11-18) |
| Forecast, upcoming, what I can afford | 50 | "I love that it projects balances based on future transactions" (Money Forecast, 2026-07-14); "lets me project out two years... see where my trouble spots are" |
| Debt end date and what an extra payment does | 69 | "Added extra payments and you see immediately how your end date and interest you save." (Debt Payoff iOS, 2026-06-03) |
| Awareness and habit change | 42 | "It's the app that makes me accountable"; "a reality check on your finances" |
| Calms ADHD or anxiety | 29 | "I have adhd so my memory is terrible but this has been so helpful for reminding me when things are due" (Bill Organizer, 2026-10-08); "to quell the anxiety of 'omg did I pay that bill?!'" (TimelyBills) |
| Replaces a spreadsheet or paper | about 9 explicit | "This app does quickly what I spent years perfecting in Excel." (Money Forecast, 2021-09-23); "I used to run my personal expenses like a business" (Money Manager iOS) |
| Home screen widget | 6 clear praise or requests | see delight section |
| Calendar view | 4 clear praise or requests | "I love how it has an actual calendar to view. It's easy to read, organize and plan." (Money Tracker iOS, 2026-06-08) |

Qualities that almost nobody mentions (verified zero or near-zero): dark mode (0), search (2), multi-currency (5), PIN lock (5, mostly not praise).

## 2. What happy users still ask for ("would be perfect if...")

About 82 of the 1,719 five-star reviews contain a wish. Grouped (hits are of those wish lines, verified regex):

| Wish | Hits | Quote | Notes for us |
| --- | --- | --- | --- |
| Bank sync, more countries | 13 | "bank syncing for more countries. I live in Jordan and none of the banks here can be synced" (Wallet Android, 2026-11-09) | We have no bank login; import from statements and shared SMS text is our answer. |
| Receipt, voice or AI entry | about 5 true hits (regex was noisy) | "would be cool to have a receipt reader or voice entry options" (TimelyBills) | Already planned (M3 import and OCR). |
| Budgets and category limits | about 9 explicit, and 20 wish lines mention "budget" | "create categories, set the budget for each and then track how much I have spent vs. left" (Money Tracker iOS, 2021) | Not built (see section 4). |
| Reminders and calendar sync | 3 reminders, 4 calendar | "If I could add due dates to my iPhone calendar then it would be perfect!" (EveryDollar, 2026-09-09); "could have added reminders for payments" (Money Manager) | Partly built. |
| Widget showing budget or spend | 3 | "not being able to see what I've spent on the budget widget" (Wallet iOS, 2026-10-18); "I hope you will add budget monitoring widget" (Money Lover Android, 2026-08-04) | Not built. |
| Custom repeat intervals | 7 | "A payment that goes off every 10 weeks can't be set... the option simply doesn't exist" (Money Manager Android, 2026-11-21) | We have every N weeks and months. Match. |
| Credit card limit, due amount, EMI | 3 explicit | "What it's missing is a way to properly register credit limits and calculate balances for credit cards" (Money Manager); "a dedicated EMI management feature for credit wallets" (Money Lover iOS) | We have this. Our advantage. |
| Opening balance of the month, carryover | 3 | "tells us how much money we are starting the month with" (Wallet iOS, 2026-06-29); "Love The New Carryover Budget Feature!" (EveryDollar) | Cheap to add. |
| Bulk edit, exact time, summing selected bills | 3 | "bulk edit the dates of multiple entries" (Money Manager); "instant summation of upcoming bills when I select multiple items" (TimelyBills) | One-offs. Skip. |
| Local backup, export, share PDF | 5 | "a create local backup option" (Money Lover); "share option... PDFs... WhatsApp" (Money Tracker iOS) | We have backup, CSV and PDF reports. |
| Android or web version of an iOS app | 7 | "I wish this was available to androids too" | Not relevant. |
| Don't count owed or borrowed money as income or expense | 1 | (Wallet Android, 2026-10-26) | Check our loan handling avoids this. |
| Stop locking past months | 2 | "a recent update now prevents users from editing budgets that are two months old or older" (EveryDollar, 2026-11-04) | We never lock past months. Keep. |

## 3. Delight details people name

- **Evening nudge to record the day's spending** (Money Manager iOS): "It even reminds you to record your expenses at the end of the day."
- **Daily spending limit** (Money Lover iOS, 2026-11-07): "The daily spending limit is a game changer." This is the same idea as our "safe to spend until payday", shown per day.
- **Widget for quick entry** (Money Lover Android, 2025-11-08): "recording daily expenses easy, esp by using its widget"; Money Manager Android: "perfect home screen widgets"; Money Tracker iOS: "Widget really helps... it's faster".
- **Calendar showing what days you spent** (Money Tracker iOS, 2026-08-28).
- **Templates for recurring costs** (Wallet Android, 2026-11-02): "my absolute favorite feature has to be the templates for logging those recurring costs".
- **Hashtags and Events for trips or projects** (Money Lover, 3 reviews): "I love to use #hashtag feature when I'm traveling".
- **Debt end date that moves when you add an extra payment** (Debt Payoff, several reviews).
- **Two-year projection and "can I afford this rent or car"** (Money Forecast, 2 reviews, tiny base): "It has helped me and my now husband to know what new bills we can afford."
- **Real people, quick replies**: YNAB 1:1 session, Copilot "you can talk to a real person", TimelyBills reinstated a lifetime purchase without questions.
- **"You can turn the AI off"** (Copilot, 2026-11-20); **easy account and data deletion** (Monarch, 2026-11-10: "That seems like an honest company to me").
- **Spending "calls me out"** (EveryDollar): "woah girl reel it in, it's only the 10th of the month".
- **Custom colours and order of everything**, **bank icons** (Money Lover Android: "providing the Sri Lanka Bank icon").
- **Forgotten subscriptions found** (Rocket Money, 4+ reviews). A bank-sync feature, not for us.

## 4. Money Planner as built vs. what is loved

Built state read from `/home/user/Tester/apps/moneyplanner/PROGRESS.md` and `spec.md`, and a code search of `src/` (no widget, no search box, no category budgets, no calendar grid found).

### Already matched (keep)

| Loved thing | Evidence | Money Planner |
| --- | --- | --- |
| Simple, easy, fast entry | 283 hits; 55 speed hits | Quick-add button, setup wizard (60-second bar still open on the release list) |
| No paywall, one-time price, no ads | 33 + 18 hits, plus Money Lover and TimelyBills users angry about subscription changes | Free core, one-time Pro, no ads |
| Manual and private, no bank link | 32 hits | Offline, no account, per-profile PIN or Face ID lock |
| Forecast and "what is left until payday" | 50 hits; Money Forecast and Rocket Money Payday view | 60-day and 24-month forecast, "safe to spend until payday" |
| Credit limit, instalments, EMI | Money Manager and Money Lover users ask for exactly this | Cards with limit and available, 0% instalment plans, loans, cheques |
| Debt end date reacting to extra payments | 69 hits | Partial and extra payments, debt-free date |
| Flexible repeats | 7 wish hits | Every N weeks or months, last day, skip, move or change one occurrence |
| Charts and reports | 67 hits | Dashboard, year table, category totals, Pro reports with PDF |
| Reminders before payments | 39 hits | Local notifications at 09:00 for shortfall, cards, cheques, debt payments (see gap 2) |
| Backup and export | 5 wish hits; data-loss fear is the top complaint in the earlier research | Auto backups (7 days), monthly reminder, CSV export |
| Light and dark, profiles | design 100 hits, partner use 76 hits | Both built; up to 6 profiles on one phone |
| Never lock old months | EveryDollar anger, 2 hits | Past and future items freely editable |

### MUST-MATCH list, ranked by impact

Impact = how many reviewers (verified hits) love or ask for it, weighted by how central it is to our users. Effort S under a day, M 1-3 days, L a week or more. "Fits" checks free-only, offline, simple-first.

| Rank | Item | Evidence | Effort | Fits | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | **Reminder for every upcoming bill and instalment** (per item: "remind me N days before", at a chosen time), not only shortfall alerts | 39 reminder hits; TimelyBills' whole 37k-rating base is built on it (ADHD and "did I pay that?!" quotes); Money Manager and EveryDollar reviewers ask for more | S-M (the scheduler and permissions exist in `features/alerts`; add a per-item lead time and a default) | Yes, local notifications | **Must.** Verify first whether ordinary recurring costs already get a reminder. The alert text promises only shortfall, card, cheque and debt reminders. |
| 2 | **Per-category monthly limits ("spent vs left")** with a progress bar in Month and Dashboard | about 9 explicit plus 20 wish lines mention budgets; Money Tracker, Money Lover, Wallet, Money Manager all lead with it ("set the budget for each and then track how much I have spent vs. left") | M (one optional number per category; engine already totals by category) | Yes, offline. Keep it optional and off by default to stay simple | **Must, kept minimal.** Do not add envelopes, zero-based or rollover rules. |
| 3 | **Daily allowance under "safe to spend until payday"** ("about X per day for N days") | Money Lover: "The daily spending limit is a game changer"; Wallet "daily budget"; Rocket Money payday view | S (engine has payday and safe amount; divide by days) | Yes | **Must, cheap, on-brand.** |
| 4 | **Quick entry speed and recurring templates**: one-tap repeat of a recent item, last-used category pre-selected, cached amounts, reachable in two taps from anywhere | 55 speed hits, and widget praise is really about speed ("faster", "easy... by using its widget"); Wallet "templates" loved | S-M (quick-add button exists; add "recent" chips and defaults) | Yes | **Must.** Time it in the walkthrough; target a one-time item in under 10 seconds. |
| 5 | **Calendar grid for the Month view** (dots or totals per day, tap a day) | about 4 clear hits, plus the "calendar of due dates" mental model in TimelyBills and Money Tracker; it is how people read a forward planner | M | Yes | **Should, v1.1 candidate.** Few reviewers, but fits our forward-looking product better than competitors' ledgers. |
| 6 | **Opening and closing balance of each month on Month and Year views** | 3 hits (Wallet, EveryDollar carryover) | S (forecast already has end-of-month balances) | Yes | **Should, almost free.** |
| 7 | **Home screen widget** showing safe to spend and the next payment | 6 clear praise or request hits (Money Manager, Money Lover, Wallet, Money Tracker iOS), 0.35% of reviews | L (needs native code; Expo support is alpha; widget testing needs a device and cloud builds) | Offline yes, but breaks the "free Expo, simple" rhythm and has a high chance of CI pain | **Not a must for 1.0.** Post-launch, Android first, if the closed test shows demand. |
| 8 | **Search and filter in the transaction list** | 2 search hits; "you can filter with different things" 1 | S | Yes | **Nice-to-have.** Skip until a month view with many items exists. |
| 9 | **Calendar export of due dates** | 2 hits (EveryDollar, Debt Payoff) | M | Needs calendar permission | Skip for now. |

Ranking note: items 1-4 all appear across at least three different apps and several storefronts; items 7-9 are thin or come from a single app.

### Things loved elsewhere that we should NOT chase

- **Bank sync and auto-categorisation** (13 wish hits): impossible offline and free. Our import and shared SMS text are the answer. Marketing line: "no bank login, ever".
- **Shared ledger with partner or family** (76 loose hits, true multi-user about 5): needs a backend. Our profiles on one phone cover the household case; do not add sync.
- **Multi-currency, investments, crypto, net worth, AI assistants**: low or zero praise from our kind of user; large complexity.
- **Zero-based envelope budgeting** (YNAB, EveryDollar): loved, but a big learning curve ("steep learning curve at first"); contradicts "simple-first".
- **Hashtags and Events**: loved by 3 Money Lover users, a one-off. A tag field could be cheap, but it adds a concept without clear love.
- **Subscription finder and bill negotiation** (Rocket Money): bank-data feature.

## 5. Words people use (store listing and keywords)

Their words, most frequent first (verified regex counts): **easy** and **simple** (283), **track** (expenses, spending, bills), **budget**, **organized**, **bills** and **due**, **remind** and **reminders**, **upcoming**, **forecast** and **project**, **cash flow**, **debt free**, **credit card** and **loans**, **no ads**, **one time purchase** and **no subscription**, **free**, **manual** and **no bank link**, **offline**, **customizable**, **clean**, **worth**, **support**, **ADHD**, **peace of mind**, **reality check**, **where my money goes**, **spreadsheet** and **Excel**, **paper**.

Suggested listing language for Money Planner, copying how happy users talk:
- "See where your money will be next month, not just where it went."
- "Safe to spend until payday."
- "Bills, loans, cards and instalments in one calendar. Reminders before each one."
- "No bank login. No ads. No subscription: one-time Pro."
- "Replace your budget spreadsheet."
- Keywords to include: budget planner, bill reminder, cash flow, forecast, salary, payday, credit card, instalment, loan, cheque, AED, expense tracker, offline.

## 6. Verdict

Happy users of every top app reward the same short list: ease, speed, fair pricing, privacy and a clear picture of what is coming. Money Planner already matches most of it, and its forward view (forecast, payday, instalments, cheques) is what only the tiny Money Forecast delivers. The clear gaps are **per-bill reminders** (verify), **optional category limits with spent vs left**, a **daily allowance** next to "safe to spend", and **faster entry with recents and templates**. A calendar grid and month opening balance are cheap follow-ups. A widget is loved by a small group and is the one item that could hurt the free, simple build path, so keep it after launch. Everything else loved elsewhere (bank sync, shared accounts, AI, envelopes) conflicts with our rules and has no clear love among our target users, so leave it out.

## Sources

Verified (script and store pages): the store links in the sample table, and the review output saved during the run (scratchpad, not kept). Earlier research: `/home/user/Tester/ideas/2026-11-21-similar-modular-finance-forecast.md`. Release bar and state: `/home/user/Tester/apps/moneyplanner/PROGRESS.md`, `/home/user/Tester/apps/moneyplanner/spec.md`. Estimates are labelled in the text (mostly effort sizes and the "about" counts).
