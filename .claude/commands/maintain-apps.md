---
description: Check every app for required yearly updates (Expo SDK, Google Play target API, Apple Xcode/iOS SDK, security fixes) and upgrade the ones that need it
argument-hint: '[slug ...]'
---

You are the **App Lead** doing maintenance on the apps in `apps/`: $ARGUMENTS (specific slugs, or every app if none are given). The goal is to keep every published app accepted by the stores and safe to update. Run this about every three months, and always before a store deadline.

**Free only:** nothing beyond the developer's Claude subscription and their Apple and Google developer accounts.

## 1. Find out what the stores require now

Store rules change every year, so check them; don't rely on memory. Search developer.android.com and developer.apple.com (and docs.expo.dev) for:

- **Google Play's target API level requirement:** the minimum `targetSdkVersion` for new apps and for updates, and the deadline. Existing apps that fall behind are hidden from new users on newer Android versions.
- **Apple's upload requirement:** the minimum Xcode and iOS SDK version for App Store uploads, and when it takes effect.
- **Which Expo SDK** targets the required Android API level and builds with the required Xcode (see the Expo SDK release notes and changelog).

Write what you find, with dates and source links, at the top of `MAINTENANCE.md` in the repository root, under a heading with today's date.

## 2. Check every app

1. Run `node scripts/app-status.mjs`. It shows each app's version, Expo SDK, last release, and a status: **ok**, **soon** (one SDK behind) or **due** (two or more behind).
2. For each app, also run these in its folder (all free and local):
   - `npm audit --omit=dev` for known security issues in shipped code;
   - `npx expo-doctor` for configuration and dependency problems.
3. An app also needs an upgrade if its Expo SDK can't meet the store requirements you found in step 1, whatever `app-status` says.

Add a table to `MAINTENANCE.md` with each app, its status, its security findings, its doctor findings, and what you recommend: **nothing**, **upgrade SDK**, or **security fix only**. Show the developer the table and ask which apps to update now. Apps that were never released only need upgrading before their first release.

## 3. Upgrade each app the developer chose

Use the same team and rules as `/update-app`. Each brief must be self-contained (project path, `spec.md` path, task, the files it owns, report format).

1. **Read the upgrade notes** for every Expo SDK between the app's version and the target version. Note the breaking changes that affect this app's dependencies and code.
2. **Upgrade one SDK version at a time** when the app is more than one behind. In the app folder: `npx expo install expo@^<next>.0.0`, then `npx expo install --fix`. Run `npx expo-doctor`, and fix what it reports.
3. Give the code changes that the breaking changes require to an **app-developer**, with the notes attached.
4. Have the **test-engineer** run the whole suite and every check. Fix failures through an **app-developer**, at most three rounds. Never weaken tests to get past an upgrade.
5. Fix security findings with `npm audit fix` (never `--force` without checking what it changes), or by upgrading the affected package. Then test again.
6. Have the **qc-inspector** run its full check. Newer SDKs sometimes add permissions or change privacy declarations.
7. Add a `## Release notes` section to `store/listing.md`, for example "Updated for the latest Android and iOS versions, with performance and stability improvements", plus any user-visible changes. Then run `node scripts/bump-version.mjs apps/<slug> patch` (or `minor` if behaviour changed).
8. Add a section to the app's `REPORT.md` for this version: SDK from and to, what changed, check results, and verdicts.

## 4. Finish

Update `MAINTENANCE.md` with what was done for each app and what's still open. Tell the developer which apps are ready to ship with `/release-app <slug>`, any store deadlines coming up, and when to run `/maintain-apps` again (the next deadline minus a month, or three months from now, whichever is sooner).
