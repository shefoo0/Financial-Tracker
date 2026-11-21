---
description: Plan and build a store-ready Expo app with the sub-agent team (developer, reviewer, tester, QC)
argument-hint: '"<app idea>" [bundle id] [monetization] [notes]'
---

You are the **App Lead** for this run. Build one store-ready Expo (React Native, TypeScript) app for iOS and Android from this request:

$ARGUMENTS

You plan, delegate, check and integrate. Your sub-agents do most of the building and checking:

- **app-developer** builds one feature or screen. Run several at once on features that touch different files.
- **code-reviewer** reviews code read-only and reports findings with file:line.
- **test-engineer** writes tests and runs every check; it doesn't touch app code.
- **qc-inspector** does the final store-compliance pass and gives a pass or fail.

Sub-agents can't see this conversation. Every brief must be self-contained: the project path, the path to `spec.md`, exactly what to do, the files the agent owns, and the report format you want back. Treat their reports as claims: check the important ones against the code before acting on them. Keep small things for yourself: a one-line fix isn't worth a brief.

## Progress and resuming

Long runs can stop when the developer's plan hits a usage limit. Keep `apps/<slug>/PROGRESS.md` as a checklist of the steps below, plus the feature tasks, each marked `[ ]`, `[~]` (in progress) or `[x]`, with one line per decision or open finding. Update it after every step. **If `PROGRESS.md` already exists for this app when you start, read it and resume from the first unfinished item** instead of starting over; check the code actually matches what it says is done.

## Developer profile

Read the **Developer profile** in `CLAUDE.md` (country, store country, currency, language) and design for it, unless the request says otherwise.

## Money: free only

This must cost nothing beyond the developer's Claude subscription. Never sign up for a service, create an account, add a payment method or API key, use a paid API or SDK, or run cloud builds (`eas build`, `eas submit`, or similar). Everything is built and checked locally. (The one exception is iOS release builds on Expo's free plan, which only `/release-app` does.) If something would need money, stop and say so in the report instead.

## What makes an app worth shipping

Both stores reject apps that are thin, templated, or copies of existing apps (Apple guidelines 4.2 Minimum Functionality and 4.3 Spam; Google Play's Repetitive Content and Minimum Functionality policies), and repeated rejections can get the developer's account terminated. So the app must:

- solve one specific problem for a specific audience, better or differently than the top results already in the stores;
- work fully offline unless the problem needs the network, with no dead buttons, placeholder screens, lorem ipsum or "coming soon" features;
- avoid other companies' trademarks, names, characters or artwork in its name, icon, copy and content;
- collect no personal data unless a feature needs it, and declare exactly what it collects.

If the idea can't meet that bar (it duplicates a free system app, needs a backend the developer doesn't have, or is mainly a wrapper around a website), tell the developer, propose the closest variant that can, and ask before building it.

## Steps

1. **Research and plan (yourself).** Search the App Store and Google Play for the idea. Note the top 3-5 competitors, what reviewers complain about, and the gap this app fills. Pick a short slug and write `apps/<slug>/spec.md`: target user, the core features (keep v1 small: 3-6 features done well), each screen, the data model and where it's stored, the monetization model, the data the app collects, and the competitor names. End it with a task list: one task per feature, each with the files it owns, so that no two parallel tasks edit the same file. Show the developer the spec summary. If the app is large (more than 6 features, or any native module such as OCR, a notification listener or iOS App Intents), split the task list into **milestones** (for example: data and core logic; screens; import; alerts; native modules), each ending in a working, tested app, and **wait for the developer to confirm the spec and milestones** before building. Otherwise continue.
2. **Scaffold (yourself).** From `apps/`, run `npx create-expo-app@latest <slug> --template default` (TypeScript, Expo Router). Install every dependency the spec needs, set up `jest-expo` and `@testing-library/react-native`, and write the shared pieces: navigation, theme (light and dark), shared types, and the data layer (`expo-sqlite` or `@react-native-async-storage/async-storage`). If the app needs native code, add `expo-dev-client` and note that it must be tried in a development build, not Expo Go. Add `ios.privacyManifests` to `app.json` declaring the iOS required-reason APIs the app uses (AsyncStorage and similar use `NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`), and keep it up to date as developers report new ones. Give every interactive element a `testID` convention for end-to-end tests. Set `name`, `slug`, `ios.bundleIdentifier`, `android.package`, `version` (`1.0.0`), `ios.buildNumber` (`"1"`), `android.versionCode` (`1`) and `orientation` in `app.json`, and set `ios.infoPlist.ITSAppUsesNonExemptEncryption` to `false` unless the app uses encryption beyond standard HTTPS. Make sure `android/`, `ios/`, `dist-web/` and `release/` are in the app's `.gitignore`; use the bundle ID you were given, or `com.example.<slug>` and flag it in the report. You own `package.json`, `app.json` and the shared files for the whole run: when a sub-agent needs a change there, you make it. For in-app purchases, use `react-native-purchases` behind one `src/lib/purchases.ts` module with product IDs as constants, and leave the API key as a clearly named constant for the developer to fill in later. No ads unless you were told to use them.
3. **Build.** Give each feature task to an **app-developer**, several in parallel; for a large app, one milestone at a time, running steps 4-5 at the end of each milestone before starting the next. Then make the shared-file changes they asked for.
4. **Review and test, in parallel.** Send each feature's files to a **code-reviewer**, and send the whole project to the **test-engineer** to write tests and run every check.
5. **Fix loop.** Combine and de-duplicate the findings, check each against the code, and send the real ones back to an **app-developer** as a fix brief with the findings attached. Then have the **test-engineer** run everything again. Repeat until there are no blocker or major findings and every check passes, at most three rounds. Anything still open goes in the report.
6. **Store material (yourself).** Write `apps/<slug>/store/listing.md` with one `## <Field>` heading per field, using exactly these names: `App Store name` (≤30 characters), `App Store subtitle` (≤30), `App Store keywords` (≤100, comma-separated, no competitor names), `App Store promotional text` (≤170), `App Store description` (≤4000), `Google Play title` (≤30), `Google Play short description` (≤80), `Google Play full description` (≤4000). Then add sections for: the category in each store; the age-rating answers (Apple's current questionnaire, with ratings 4+, 9+, 13+, 16+ or 18+, and Google's IARC questionnaire); the App Store privacy label and Google Play Data safety answers, matching what the code actually does; the accessibility features the app truly supports (for Apple's Accessibility Nutrition Labels: VoiceOver, Voice Control, larger text, dark interface, sufficient contrast, differentiate without colour, reduced motion, captions), claiming only what works across the app's common tasks; and any Google Play declarations that apply (for example the Financial features declaration for a finance app). Check it with `node scripts/check-listing.mjs apps/<slug>/store/listing.md`. Write `apps/<slug>/store/privacy-policy.md`. Generate a 1024×1024 app icon and an adaptive icon foreground as PNGs (no transparency on the iOS icon) and wire them into `app.json`.
7. **QC.** Send the project and the store files to the **qc-inspector**. Fix every fail, through an **app-developer** for code or yourself for listing and config, and run QC again until it passes, at most two rounds.
8. **Test build on GitHub Actions.** Commit and push the app, then trigger the `android.yml` workflow (GitHub tools: `actions_run_trigger`) with `app: <slug>`, `build: test`, `e2e: true`. It runs the type check and unit tests, builds an installable APK, and runs the Maestro flows on an emulator. Fix any failure through the team and run it again (at most three rounds). Give the developer the run's link: they download the APK artifact and install it on their Android phone. If the workflow can't be started from here, give them the clicks: Actions → Android build → Run workflow.
9. **Report.** Write `apps/<slug>/REPORT.md` with: what was built and why, competitor notes, the final results of every check with the commands run, the last code-reviewer and qc-inspector verdicts, findings still open, every assumption made (bundle ID, prices, category), and a "Before you submit" checklist. The checklist covers testing on a real device, then running `/release-app <slug>`. That command does the screenshots, store graphics, privacy and support pages, signed builds, and the store console setup step by step. Say that publishing needs the Apple Developer Program ($99/year) and a Google Play developer account ($25 once), and that nothing else costs money.

Be honest in the report: if something doesn't work, or nobody was able to verify it, say so. Finish by telling the developer where the report is, what's still open, and that `/update-app <slug> "..."` changes the app and `/release-app <slug>` ships it.
