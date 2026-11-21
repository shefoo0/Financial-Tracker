# App Factory

A team of Claude Code sub-agents that turns an app idea into a store-ready **Expo (React Native)** app for iOS and Android, then helps you release and update it. It runs inside Claude Code, so **it uses only your Claude subscription**: no API key, no API billing, and no paid services.

| Agent | Where it's defined | Job |
| --- | --- | --- |
| **App Lead** (master) | your Claude Code session, started with `/new-app` (`.claude/commands/new-app.md`) | Researches competitors, writes the spec and task list, sets up the project, hands out tasks, checks the reports, writes the store listing and the final report |
| **app-developer** | `.claude/agents/app-developer.md` | Builds one feature or screen. Several run in parallel on separate files. |
| **code-reviewer** | `.claude/agents/code-reviewer.md` | Read-only review for bugs, gaps against the spec and store-rejection risks, with `file:line` evidence |
| **test-engineer** | `.claude/agents/test-engineer.md` | Writes Jest tests and runs the type checker, linter, `expo-doctor`, tests and bundle exports. It doesn't touch app code. |
| **market-researcher** | `.claude/agents/market-researcher.md` | Researches one store niche for `/find-ideas`: top apps, review complaints, ideas with evidence |
| **qc-inspector** | `.claude/agents/qc-inspector.md` | Final pass or fail against the store guidelines, listing limits, privacy answers versus the code, leftover placeholders and hidden costs |

The sub-agents run on Sonnet to save your plan's usage. The App Lead uses whatever model your session uses.

How one run goes:

1. **Plan:** the Lead writes the spec.
2. **Build:** developers build the features in parallel.
3. **Check:** the reviewer and the test engineer check each feature. The Lead sends real findings back to a developer, for up to three rounds.
4. **Store material:** the Lead writes the listing and privacy policy.
5. **QC:** the QC inspector has to pass the app.
6. **Report:** the Lead writes `REPORT.md`.

**You submit to the stores yourself.** No agent does.

## About the stores

Apple (guidelines 4.2 and 4.3) and Google Play (repetitive-content and minimum-functionality policies) reject apps that are templated, thin or copies, and accounts that keep submitting them get terminated. This team is set up to build *fewer, distinct* apps. Test each app on a real device and read its `REPORT.md` before you submit it.

## What it costs

| | Cost |
| --- | --- |
| Building and testing apps with this team | Included in your Claude subscription. Large apps use more of your plan's usage limits, and if you hit a limit, wait for it to reset and type "continue". |
| Expo, Jest, local builds, Expo Go on your phone | Free |
| Publishing on the App Store | Apple Developer Program, $99/year |
| Publishing on Google Play | Google Play developer account, $25 once |

The agents are told never to sign up for anything, add a payment method or API key, use a paid service, or run cloud builds.

## Setup on your PC

You need:
- [Claude Code](https://claude.com/claude-code), signed in with your Claude subscription
- Node.js 20+ and Git
- For release builds: Android Studio (free, any OS) and, for iOS, a Mac with Xcode (free)

```sh
git clone https://github.com/shefoo0/tester.git
cd tester
npm install
npx playwright install chromium
claude
```

## Commands

| Command | What it does |
| --- | --- |
| `/find-ideas [topic or audience]` | Sends market researchers into several niches in parallel, scores the ideas they find, and saves a ranked shortlist with ready-to-run `/new-app` lines to `ideas/` |
| `/new-app "<idea>" [bundle id] [monetization]` | Researches, plans, builds, reviews, tests and QCs a new app in `apps/<slug>/` |
| `/release-app <slug> [android\|ios\|both]` | Takes you step by step through screenshots, store graphics, the privacy and support pages, signed builds, and setting up the app in the Play Console and App Store Connect |
| `/update-app <slug> "<change>"` | Adds features or fixes with the same team, re-tests everything, writes release notes and bumps the version |
| `/maintain-apps [slug ...]` | Checks the stores' current yearly requirements, finds apps whose Expo SDK or dependencies are falling behind, and upgrades the ones you choose |

A typical cycle: `/find-ideas` → `/new-app` → test on your phone → `/release-app` → `/update-app` as users give feedback → `/maintain-apps` every three months.

## Building an app

In Claude Code, inside this folder:

```
/new-app "Offline habit tracker for rotating shift workers" com.yourname.shifthabits "free, with a one-time $2.99 pro unlock"
```

Only the idea is required. Without a bundle ID, the Lead uses `com.example.<slug>` and flags it. The app ends up in `apps/<slug>/` with:

- the Expo project
- `spec.md`: research and plan
- `store/listing.md` and `store/privacy-policy.md`
- `REPORT.md`: check results, reviewer and QC verdicts, assumptions, and a **Before you submit** checklist

You can see and approve each command the agents run, the same as in any Claude Code session.

## Trying the app (free)

```sh
cd apps/<slug>
npx expo start          # scan the QR code with the Expo Go app on your phone
```

## Releasing an app

Run `/release-app <slug>` in Claude Code. It does what can be done on your PC, and tells you exactly what to do for the rest:

1. **Preflight:** re-runs every check and confirms QC passed.
2. **Screenshots:** captures the app's web version at the App Store (1320×2868) and Google Play (1080×1920) sizes, plus iPad if the app supports it. Check them, because the web version can differ from the native app.
3. **Store graphics:** the 512×512 icon and the 1024×500 feature graphic that Google Play requires.
4. **Privacy and support pages:** publishes them to GitHub Pages, so the stores get the public URLs they require. GitHub Pages is free for public repositories. If this repository is private on GitHub's free plan, use a separate public repository for the pages.
5. **Android:** you create an upload key once, in your own terminal so passwords never reach the chat. Claude builds a signed `.aab` with Android Studio's tools.
6. **iOS (Mac only):** Claude prepares the Xcode project, and you archive and upload it from Xcode.
7. **Play Console and App Store Connect:** every form, with the text to paste. New personal Google Play accounts must run a closed test with 12 testers for 14 days before going public. The command walks you through it and tracks the dates.

Progress is logged in `apps/<slug>/RELEASES.md`. Signing keys stay in `~/.app-signing/`, outside the repository, so back them up somewhere safe.

## Keeping apps on the stores

Every year, Google Play requires apps to target a recent Android version, and Apple raises the minimum Xcode and iOS SDK version for uploads. Apps that fall behind can't be updated, and on Google Play they're hidden from new users. Run `/maintain-apps` about every three months. It:

1. checks the current requirements and deadlines on the official sites, and logs them in `MAINTENANCE.md`;
2. runs `node scripts/app-status.mjs`, which shows each app's Expo SDK as **ok**, **soon** (one behind) or **due** (two or more behind), plus `npm audit` and `expo-doctor` for each app;
3. upgrades the apps you pick, one SDK at a time, with the full test, review and QC loop, then bumps the version so you can ship with `/release-app`.

## Updating an app

```
/update-app shift-habits "add a weekly summary screen and fix the streak reset at midnight"
```

The team plans the change, migrates stored data if it needs to, builds it, re-runs the whole test suite, updates the release notes and listing, passes QC, and bumps the version. Then run `/release-app <slug>`.

## Scripts

The commands use these, and you can run them yourself too. All are free and run on your PC.

| Script | Purpose |
| --- | --- |
| `node scripts/check-listing.mjs apps/<slug>/store/listing.md [--banned "A,B"]` | Checks the listing against each store's character limits, plus placeholders and banned names |
| `node scripts/screenshots.mjs apps/<slug> --routes "/,/stats" [--dark] [--devices ...]` | Store screenshots |
| `node scripts/render-graphic.mjs in.html out.png --size 1024x500` | Store graphics |
| `node scripts/publish-pages.mjs [slug]` | Privacy and support pages into `docs/` for GitHub Pages |
| `node scripts/bump-version.mjs apps/<slug> patch\|minor\|major\|build` | Version and build numbers |
| `node scripts/app-status.mjs [--latest <sdk>]` | Every app's version, Expo SDK, last release and upgrade status |

The screenshot and graphics scripts need one-time setup: `npm install`, then `npx playwright install chromium`.

## Development

```sh
npm install
npx playwright install chromium
npm test
```

To change how an agent works, edit its file in `.claude/agents/` or the commands in `.claude/commands/`.
