# Customisation and settings UX: research and proposal

Researched 2026-11-22 for Money Planner (Expo, offline, free only). The question: how to
make it faster to change colours, mode, charts and the money basics, and to add more
charts, without a long Settings scroll.

How this was checked. Store reviews come first-hand from `scripts/store-lookup.mjs`
(App Store `--country us`: Copilot 1447330651, Monarch 1459319842, YNAB 1010865877,
Money Manager 560481810, Spendee 635861140, Wallet 1032467659; Google Play: Money
Manager `com.realbyteapps.moneymanagerfree`, Money Manager & expenses
`ru.innim.my_finance`, Spendee `com.cleevio.spendee`, Wallet
`com.droid4you.application.wallet`; newest 5-star and 1-3-star reviews). The Apple HIG
Settings and Context menus pages and Android's Settings guidance were read in full.
Competitor help pages and NN/g were read from search excerpts only, so the exact steps
in those apps may have changed since.

---

## 1. What the app has today

- **Settings** (`src/app/(tabs)/settings.tsx`, about 290 lines, about 12 cards):
  profile and Manage profiles, Appearance (System/Light/Dark), Chart card (5 swatches),
  currency label, payday, today's balance (with overdrawn toggle), buffer, Alerts
  (phone notifications, bill reminders, 3 threshold fields and a Save button), Lock,
  Categories, data (backup reminder, back up, automatic backups, restore, CSV export),
  About.
- **Home** (`src/app/(tabs)/index.tsx`) is a fixed order of 10 blocks: hero forecast,
  Payday, 3 stat tiles, Alerts, Coming up, Reports, This month, Spending by category,
  End-of-month balance (12 months), Year (stats and a table). None can be hidden or
  moved.
- **Charts**: `ForecastHero`, `BalanceChart`, `ForecastChart` and `BarList` in
  `src/components/charts/`. Each Home card builds its own chart inline. There is no
  shared card or chart wrapper.
- What it costs the user now: changing the buffer means Settings tab, scrolling past
  profile, appearance, chart style, currency and payday, typing a value, then a separate
  Save. The setting is on a different screen from the dashed buffer line it changes.

## 2. What top finance apps do

| App | Home customisation | Where per-item options live |
| --- | --- | --- |
| Monarch | "Customize" button at the bottom of the mobile dashboard. Drag cards to reorder and turn off the ones you don't need. The mobile layout is saved separately from the web one. [1][2] | On the card |
| Wallet (BudgetBakers) | "Add widget" button at the bottom of Home, then a gallery with "+ Add to dashboard". Each card's ⋯ menu has Remove and "Change widget order". [3] | Card ⋯ menu |
| Quicken Simplifi | Customize panel: switch tiles on or off and drag them by a six-dot handle. [4] | Panel |
| Revolut (10 and later) | Home made of widgets for the features you use. Pin a product to Home from its ⋯ menu. Themes and backgrounds. Users can't go back to the old layout. [5][6][7] | Product ⋯ menu |
| Emma | "Organise" chooses which widgets show on the Feed and which tabs show in the bottom bar. This is a paid feature. [8] | Organise screen |
| Apple Stocks | Touch and hold a symbol and drag it, or ⋯ → Edit Watchlist, then drag. Long-press always has a visible path too. [9] | Edit list |
| NatWest (bank) | Touch and hold to rearrange, or Edit with up and down arrows. [10] | Edit mode |

The pattern they share:
1. **A visible "Customize / Edit / Add widget" button at the end of Home**, not in Settings.
2. **An edit mode** where you show, hide and reorder cards. Drag is offered, and the better
   ones also give arrows or a list.
3. **A gallery** for adding a card.
4. **A ⋯ menu on each card** for that card's options and Remove.
5. **A short global Settings** screen.

## 3. What reviewers say (first-hand, 2025-2026)

**5-star reviewers praise:**
- Customisation that stays simple. "Great combination of standardization and
  customization" (Copilot). "Simply to use … I don't like too many confusing features
  that overwhelm me. This app is just right!" (Monarch). "I love the minimalistic style
  and the possibility to customise pretty anything!" (Money Manager, Android).
  "Straight forward, customizable, locally stored … one-time-fee" (Money Manager, iOS).
- Colour and themes. "Couldn't change the colour for the theme … before but can do it
  now which is very cool" (Wallet). "Please add new style theme colour" (Money Manager).
  "I like the icons and the color themes … without the little transactions making it
  look cluttered" (Wallet).
- Charts that are useful and not just decoration. "Helpful charts and analytics"
  (Wallet). "I just wanted a pie chart and I got one" (Spendee). Asked for: "No
  dedicated month-wise/year-wise income bar charts" (Wallet). "Not being able to see
  what I've spent on the budget widget" (Wallet).

**1-3-star reviewers complain:**
- **Home space taken by charts they don't want, with no way to change it.** "About 70%
  of the Home Screen is taken up by information I don't need, like the chart and budget
  badges" (Spendee 6, 3★). "There is no option to customize the interface" (Spendee
  Android, 3★). "The column bar chart at the top takes up way too [much]" (Spendee, 1★).
- **Redesigns forced on users, and hidden information.** "Stop making changes with no
  option to decline them … a 'Classic' view … should at least be an option" (YNAB, 3★).
  "Recent visual changes obfuscate information … summaries add clutter" (YNAB, 1★).
  "Hidden amounts after latest update" (YNAB, 5★ but a complaint). Secondary reporting
  says YNAB's June 2026 v26.20 redesign lost about a star on iOS for adding taps and
  hiding core functions. [11]
- **Too much UI that adds no value.** "It has 8 tabs but I can only find 2 of them useful"
  (Copilot, 3★). "Replaced the 'create record' button with a menu button – cluttered
  with other useless junk … more button clicks" (Wallet, 1★). "Aesthetically pleasing UI
  but dysfunctional with non useful customization" (Monarch, 1★). "The interface is
  overwhelming" (Spendee, 3★).
- **A basic setting that can't be changed.** "Can't change my main currency"
  (Money Manager & expenses, 2★). "Can't change the currency after the latest update"
  (Spendee, 1★). "No Category or Subcategory Customization" (Wallet, 1★).

**What this means for Money Planner:** let people hide what they don't use and keep the
order they chose. Never move or remove their cards in an update. Keep the
basics (balance, buffer, payday, currency, categories) easy to change. Don't add
options that only decorate.

## 4. Platform guidance

**Apple HIG, Settings** [12]
- "Minimize the number of settings you offer … too many settings can make the
  experience feel less approachable, while also making it hard to find a particular
  setting."
- "When possible, prefer letting people modify task-specific options without going to
  your settings area … showing or hiding parts of the current view, reordering a
  collection of items, or filtering a list, make these options available in the screens
  they affect." This is exactly the Home edit mode and the chart range options.
- "Put general, infrequently changed settings in your custom settings area."
- "Avoid using settings to ask for setup information you can get in other ways … an app
  can detect whether people are currently using Dark Mode." Keep **System** as the
  default appearance.

**Apple HIG, Context menus** [13]
- A context menu is "hidden by default, so people might not know it's there."
  "**Always make context menu items available in the main interface, too.**" So
  long-press can only be a shortcut, never the only way.
- Keep menus short (about 3 groups at most) and support them consistently across the app.
  Put destructive items last and mark them red.

**Android / Material 3, Settings** [14]
- "Don't include frequently accessed actions. These should be contextual to the feature
  they most affect." "Place frequent contextual preferences close to the feature it
  affects", for example closed captions on the video player.
- Avoid putting app info such as the version number in Settings, and use a separate
  About screen. Group into small sections, and use a subscreen once there are 15 or more
  settings. Show each setting's current value as secondary text.
- "Avoid overriding system themes unless extending with greater customization."
- Write labels without generic verbs ("Edit", "Manage", "Change") and as impersonal
  nouns ("Notifications", not "Notify me").

**Material 3, Bottom sheets** [15]: modal bottom sheets present a set of choices or
actions as "an alternative to menus or simple dialogs". They are the right container for
the small per-card editors.

**Research on customisation and gestures**
- NN/g: "Users rarely — if ever — customize". Keep a good default for users who never
  customise, and if people can't find the feature they won't use it. [16][17]
- NN/g: remembering gestures is hard, and "out of sight is out of mind" applies to
  hidden UI. [18]
- Hoober: 49% of people hold the phone in one hand and thumbs drive 75% of touches. [19]
  Edit controls belong low on the screen or inside bottom sheets, not only in the top
  corners.

## 5. Recommended design

Ground rule: **every option must earn its place**. An option stays only if (a) the
spec needs it, (b) reviewers ask for it, or (c) it removes a step.

### A. Edit things where they are (✎ on the card → a small bottom sheet)

Every editable card gets the same small **✎ button** (44×44 touch target, top-right of
the card, label "Edit <card name>"). It opens a bottom sheet with only that card's
options and a Save button in the thumb zone. One pattern is used everywhere. Long-press
on a card opens the same sheet as a shortcut.

| Card | ✎ sheet contents | Moves out of Settings |
| --- | --- | --- |
| Hero (balance forecast) | Today's balance (with overdrawn), Buffer, **Range** (30 / 60 days / 12 months), **Card style** (5 swatches with a live preview) | Today's balance, Buffer, Chart card |
| Payday | Payday (day N / last day), Salary amount shortcut ("Edit salary" opens the recurring item) | Payday |
| Coming up | Bill reminders (on/off and days before), "Show next N" (5/10) | Bill reminders |
| Alerts card | Phone notifications (explainer, then permission), the 3 thresholds | Alerts block |
| Spending by category | Period (month/year, the existing Segmented control), "Categories…" link | Categories (stays reachable from Settings too) |
| Any chart | Range where it makes sense, Remove from Home | — |
| Stat tiles | none, so no ✎ | — |

Notes:
- **Save on change** in sheets (each choice saves at once, with a short "Saved" toast).
  Money fields save on Done, so the separate "Save buffer" and "Save balance" buttons
  go away. Undo for Remove: a toast with "Undo" for 5 s.
- Tapping the balance number in the hero opens the same sheet with the balance field
  focused ("tap a number to change it"). This is a shortcut. The ✎ button stays visible.
- Category limits (if added later) belong on the Month screen's category rows, not in
  Settings.

### B. Home Edit mode and "Add a chart"

- An **"Edit Home" button at the bottom of Home** (Monarch and Wallet place theirs at the
  end, which is in thumb reach once scrolled), plus "Edit Home" in each card's sheet.
- **Edit mode**: the cards shrink to titled rows, each with a show/hide switch and
  **↑ / ↓ buttons**. Drag by a ≡ handle is optional (reanimated and gesture-handler are
  already installed). The arrows are accessible to screen readers, and an
  `accessibilityActions` alternative is needed for drag anyway. A **Done** button sits
  at the bottom. "Reset to default layout" sits at the end of the list.
- **Add a chart**: a gallery sheet with a small preview of each chart drawn from the
  user's own numbers and an "Add" button. Each kind can be added once to start with,
  which keeps it simple.
  1. Balance forecast (the hero, fixed first and can't be hidden; it is the app's point)
  2. Spending by category (exists, `BarList`)
  3. End-of-month balance, 12 months (exists)
  4. **Income vs spending**, monthly bars for the year (new; reviewers ask for this, and
     the data is already in the year summary)
  5. **Debt payoff**, remaining debt to the debt-free date (new; engine data exists)
  6. **Savings rate**, % by month (new; check with the developer, because savings rate is
     a Pro Reports "key figure")
- **Code**: one `HomeCard` shell (title, ✎, ⋯ in edit mode) and one `ChartCard` that
  takes a **chart registry** entry `{ id, title, ranges, build(input, range) →
  series, render: 'line' | 'bars' }`. Adding a chart then means adding one registry
  entry and one engine selector, with no new screen. The layout is one per-profile
  setting `homeLayout: { id: string; visible: boolean; range?: string }[]`. Unknown ids
  are ignored and new cards are appended hidden, so **an update never rearranges a
  user's Home** (the YNAB and Spendee lesson). The default layout is today's order, with
  Year and End-of-month shown so nothing disappears for existing users.

### C. A much shorter Settings (6 groups, about 12 rows)

1. **Profile**: avatar and name, then Manage profiles
2. **Appearance**: one row with the current value ("System · Ocean card"), which opens the
   sheet in D
3. **Lock**: PIN / Face ID
4. **Notifications**: phone notifications and bill reminders (the same controls as the
   cards' sheets, for people who look here first)
5. **Money basics**: currency label, Categories. Payday, balance and buffer also appear
   here as rows showing their value that open the same sheets, because some people will
   look in Settings.
6. **Your data**: back up, automatic backups, restore, export CSV
7. **About** (a row that opens a screen): version, "not financial advice", privacy policy

Text fields and Save buttons are taken out of the scroll. Every row is a `ListRow` showing
its current value (Material's "show the setting status"), and the editors are the same
sheets the cards use. **One editor component per setting, opened from two places**, so
there is no duplicated logic.

### D. Appearance sheet

One bottom sheet: **Mode** (System / Light / Dark, segmented, System default) and
**Card style** (the 5 existing swatches) above a **live mini preview** of the hero card
in the chosen mode. It saves on tap. It opens from Settings → Appearance and from the
hero's ✎ sheet. The spec's 2026-11-22 decision says "Appearance lives only in Settings
(not in the profile switcher)". This proposal keeps it out of the profile switcher. Only
the card style (which is about the chart card) is also offered on the hero, so check
this with the developer. **Don't add an accent-colour picker, fonts or extra themes
now.** Card style already gives the colour choice reviewers ask for, and each extra
colour has to pass the 3:1 contrast checks in `ChartStyleSetting.test`.

### E. One-handed reach and discoverability

- Sheets open from the bottom. Primary buttons (Save, Done, Add) go at the bottom of the
  sheet. "Edit Home" sits at the end of Home.
- The ✎ button is always visible (not only on long-press). It is shown subtly (secondary
  tone) so cards stay clean.
- **A first-use hint, once**: after setup, a small dismissible tip on the hero, "Tap ✎ to
  change your balance, buffer or chart". After 3 Home visits, one tip at the bottom:
  "Make Home yours: Edit Home". Stored per profile and never shown again once dismissed
  or used.
- Every ✎ and ↑/↓ has an accessibility label ("Edit buffer and chart", "Move Spending by
  category up").

### F. What NOT to do

- **Hidden gestures as the only way** (long-press only, swipe to delete a card, shake).
  HIG: always available in the main interface too.
- **Too many knobs**: per-chart colours, chart-type switching (line vs bar for the same
  data), font size (the system handles it), custom accent colours, density settings.
  NN/g says most people never customise, so polish the default instead.
- **Duplicate chart instances or free-form widget sizes** (iOS home-screen-style
  resizing). That is a lot of work for little gain. Revisit if users ask.
- **Re-ordering or resetting users' layouts in updates**, or forcing a redesign with no
  way back.
- **Putting Appearance or Lock behind the profile button** (Android warns against
  profile icons for settings, and the spec decision agrees).
- **Removing the Settings route to a setting** once it is on a card. Keep both entry
  points, with one editor.
- **Edit sheets with their own Save that loses changes on swipe-down.** Save on change,
  or warn before discarding.

## 6. Ranked build order (smallest win first)

1. **Shared edit sheets plus ✎ on hero, Payday and Coming up.** This removes the 4 biggest
   Settings cards and is mostly moving existing code.
2. **Settings rewrite** to value-showing rows that open those sheets, with About on its
   own screen.
3. **Appearance sheet** with a live preview.
4. **`HomeCard` / `ChartCard` and the chart registry**, porting the 3 existing charts.
5. **Home Edit mode** (show/hide, ↑/↓, reset) with `homeLayout`.
6. **"Add a chart" gallery** with Income vs spending, then Debt payoff (and Savings rate
   if the developer keeps it free).
7. **First-use hints.**

Tests to add: layout merge (unknown and new ids, defaults), the registry builders (pure
engine tests), sheet save and undo, and Maestro flows "edit buffer from hero" and
"hide and reorder a card".

---

## Sources

1. Monarch help, Customizing Your Dashboard: https://help.monarch.com/hc/en-us/articles/360058127551-Customize-Your-Dashboard
2. Monarch, Customizable dashboard: https://www.monarch.com/blog/customizable-dashboard-manual-transactions
3. BudgetBakers Wallet, Add or Modify Dashboard Cards/Widgets: https://support.budgetbakers.com/hc/en-us/articles/7150077480850-Add-or-Modify-Dashboard-Cards-Widgets
4. Quicken Simplifi, Customizing your dashboard: https://info.quicken.com/sim/customizing-your-dashboard
5. Revolut 10 blog: https://www.revolut.com/blog/post/revolut-10/
6. Revolut 8.0, pin to home: https://www.revolut.com/blog/post/simplified-app-infinite-possibilities/
7. Revolut community, Revolut 10 thread: https://community.revolut.com/t/revolut-10/241965?page=8
8. Emma help, Organise your experience: https://help.emma-app.com/en/article/organise-your-experience-1e66k73/
9. Apple iPhone User Guide, Stocks: https://support.apple.com/en-gb/guide/iphone/iph1ac0b1bc/14.0/ios
10. NatWest, widgets feature: https://www.natwest.com/support-centre/banking-from-home/how-to-use-the-mobile-app/what-is-the-widgets-feature.html
11. YNAB v26.20 backlash (secondary): https://mwm.ai/articles/ynab-v26-20-adds-ceo-book-ads-sparks-user-outrage-over-ui-changes-in-june-2026
12. Apple HIG, Settings: https://developer.apple.com/design/human-interface-guidelines/settings
13. Apple HIG, Context menus: https://developer.apple.com/design/human-interface-guidelines/context-menus
14. Android Developers, Settings pattern: https://developer.android.com/design/ui/mobile/guides/patterns/settings
15. Material, Bottom sheets: https://material.io/components/sheets-bottom
16. NN/g, Customization of UIs and Products: https://www.nngroup.com/articles/customization-of-uis-and-products/
17. NN/g, Customization (Alertbox): https://www.nngroup.com/alertbox/customization.html
18. NN/g, iPhone X (gestures and hidden UI): https://www.nngroup.com/articles/iphone-x/
19. Hoober, How Do Users Really Hold Mobile Devices? (UXmatters, 2013): https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
20. Store reviews: `node scripts/store-lookup.mjs reviews <ios|android> <id> --min-stars 5` and `--max-stars 3`, run 2026-11-22 (ids at the top).
