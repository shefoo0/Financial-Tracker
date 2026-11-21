---
description: Walk through releasing an app from apps/ to Google Play and the App Store, step by step (free tools only)
argument-hint: '<slug> [android|ios|both]'
---

Release the app in `apps/<slug>/` to the stores. Arguments: $ARGUMENTS (the slug, then `android`, `ios` or `both`; default `both`).

You do the steps that can be done on this computer, and you guide the developer through the ones they have to do themselves (signing, store websites, uploading). Go one step at a time. When a step needs the developer, say exactly what to do, then wait for them to say it's done before you go on. Keep a running log in `apps/<slug>/RELEASES.md` (create it if needed): version, build numbers, date, and each step's status.

## Resuming

`RELEASES.md` is also the checkpoint. If it shows a release in progress, resume from the first step not marked done, after checking that its outputs (screenshots, pages, build files) still exist.

## Rules

- **Free only.** The only costs are the developer's Apple Developer Program ($99/year) and Google Play developer account ($25 once). Don't use paid services or paid upload tools. Android builds run on **GitHub Actions' free standard runners** (never larger, billed runners) and upload through the Play Console website. iOS builds run on **Expo's free plan (iOS only, no payment method)** started from GitHub Actions, or in Xcode on a Mac.
- **Secrets never touch the chat or the repo.** Never ask for, type, print or store passwords, and never commit signing keys. When a command needs a password, give the developer the command to run in their own terminal. Signing keys live outside the repository, in `~/.app-signing/`.
- **Ask before you push to git or change anything outside the repository**, other than files the developer asked you to create.
- Check the facts in this guide against the current store help pages when something doesn't match what the developer sees. The store websites change.

## Steps

### 1. Preflight

Read `apps/<slug>/spec.md`, `REPORT.md` and, if it exists, `RELEASES.md`. Then:
- Confirm the last QC verdict is **pass** and no blocker or major findings are open. If not, stop and suggest `/update-app <slug> "fix the open findings"`.
- Have the **test-engineer** run every check again, and run `node scripts/check-listing.mjs apps/<slug>/store/listing.md`. Stop on failures.
- Check `app.json`: `ios.bundleIdentifier` and `android.package` aren't `com.example.*` (both are permanent once uploaded, so ask the developer for their own if they are), `version` is set, `ios.buildNumber` and `android.versionCode` exist, and `ios.infoPlist.ITSAppUsesNonExemptEncryption` is `false` unless the app uses encryption beyond standard HTTPS.
- If `RELEASES.md` shows an earlier upload of the same build numbers, run `node scripts/bump-version.mjs apps/<slug> build`.
- **Store requirements today.** These change every year, so confirm them on developer.android.com and developer.apple.com, and record the current values in `RELEASES.md`. As of late 2026:
  - Google Play: new apps and updates must target **Android 16 (API level 36)** or higher (from 31 August 2026).
  - Apple: uploads must be built with **Xcode 26 or later** and an iOS 26 SDK (from 28 April 2026), with the **updated age-rating questionnaire** answered.
  - Apple: an **`ios.privacyManifests`** entry is needed for required-reason APIs.
  If the app's Expo SDK can't meet them, stop and suggest `/maintain-apps <slug>`.

### 2. Screenshots

1. In the app folder, add web support if it's missing: `npx expo install react-dom react-native-web @expo/metro-runtime`. This is free; it's only used for screenshots.
2. Choose the 3-8 routes that best show the app's main features (from `spec.md`), seeded with realistic sample data if the app starts empty. If you need sample data, add a dev-only route or flag that is excluded from production builds, and remove it afterwards.
3. Run `node scripts/screenshots.mjs apps/<slug> --routes "<routes>"`. Add `--devices iphone-6.9,ipad-13,android-phone` if the app supports iPad (`ios.supportsTablet`). Run it again with `--dark` if dark mode looks good.
4. Open a few of the PNGs and check that they show real content, not loading spinners, broken layouts or missing native features. Ask the developer to look through them too. Anything native-only (maps, camera, widgets) needs screenshots from a simulator or device instead.

### 3. Store graphics (Google Play)

Google Play needs a 512×512 icon and a 1024×500 feature graphic. Write `apps/<slug>/store/graphics/icon-512.html` (the app icon from `app.json`, scaled to 512×512) and `feature-graphic.html` (app name, a short tagline from the listing, the icon, and the app's colours; no screenshots of other apps, no device frames, no "free" or "#1" claims). Render them:

```sh
node scripts/render-graphic.mjs apps/<slug>/store/graphics/icon-512.html apps/<slug>/store/graphics/icon-512.png --size 512x512
node scripts/render-graphic.mjs apps/<slug>/store/graphics/feature-graphic.html apps/<slug>/store/graphics/feature-graphic.png --size 1024x500
```

Show them to the developer.

### 4. Privacy policy and support pages

1. If `apps/<slug>/store/support.md` doesn't exist, write it: what the app does, answers to likely questions, and how to get help. Ask the developer which contact email to publish; never make one up.
2. Run `node scripts/publish-pages.mjs <slug>`, then ask the developer before you commit and push `docs/`.
3. The first time, the developer turns on GitHub Pages: repository **Settings → Pages → Deploy from a branch →** the branch they pushed, folder **/docs**. GitHub Pages is free for public repositories. If this repository is private and they're on GitHub's free plan, they'll need a separate free **public** repository for `docs/`. Offer to set that up.
4. Add `## Privacy policy URL` and `## Support URL` sections to `store/listing.md` with the two URLs, and have the developer open both in a browser to confirm they load.

### 5. Android build (signed .aab)

Android builds run on **GitHub Actions** (free minutes on GitHub's standard Linux machines), so the developer needs no Android tools. Start workflows with the GitHub tools (`actions_run_trigger` with the workflow file name and its inputs, on the branch the app is on), and follow them with `actions_get` and `get_job_logs`. If those tools aren't available, give the developer the exact clicks: **Actions → <workflow> → Run workflow**.

1. **Upload key (once, shared by all the developer's apps).** If the repository has no `ANDROID_KEYSTORE_BASE64` secret yet (the build's "Load the upload key" step says so), ask the developer to:
   1. run **Actions → Android upload key → Run workflow**, typing `create`;
   2. download the `android-upload-key` artifact from that run;
   3. save `upload.jks` and `SECRETS.txt` in their password manager as the backup;
   4. add the four secrets it lists under **Settings → Secrets and variables → Actions**;
   5. delete the run and the downloaded files.

   The key and its password never pass through the chat. Google Play App Signing holds the real app signing key, so a lost upload key can be reset through Google support.
2. **Build:** trigger `android.yml` with `app: <slug>`, `build: release`, `e2e: true`. It type-checks and runs the unit tests, builds a signed APK and AAB, checks the target API level against Google Play's minimum (in the workflow's `MIN_TARGET_SDK`), and runs the Maestro flows on an emulator. Report each failed step from the logs, fix it (through `/update-app` for app code), and run it again.
3. **Smoke test on a real phone:** give the developer the run's link. They download the `<slug>-<version>-<code>-android` artifact, install the `.apk` on their Android phone, and try the main journeys. A crash on launch is the most common reason for rejection, so wait for their OK.
4. **For Google Play:** the `.aab` in the same artifact is the file to upload (step 7). Record the run link, version and versionCode in `RELEASES.md`.

**Building on the developer's own computer instead** (only if they ask; it needs Android Studio): `npx expo prebuild --platform android --clean`, then `node ../../scripts/android-signing.mjs android/app/build.gradle` from the app folder, then `./gradlew bundleRelease` in `android/` with the same four `ANDROID_*` environment variables set in their own terminal (never in chat).

### 6. iOS build

#### Without a Mac: Expo's free cloud plan, started from GitHub Actions

If `uname` isn't `Darwin` (and in cloud sessions), iOS builds run on Expo's servers on the **free plan**. This is the one cloud build service allowed, and only for iOS, because iOS apps can only be built on macOS. Rules:
- The developer's Expo account must **never have a payment method**. Never upgrade, buy build credits or pick a priority build. The safety hook and the workflow allow iOS only.
- The free plan gives a limited number of builds a month in a slower queue. If they run out, Expo waits until next month; it doesn't charge. So test changes on Android first, and only build iOS for release candidates. Log each build in `RELEASES.md` so you can see how many are left.
- Anything that needs a password or an Apple sign-in, the developer does in the browser or in their own terminal, never in chat.

Steps:
1. **Once:** the developer creates a free account at expo.dev (no card), creates an access token (expo.dev → Account settings → Access tokens), and adds it as the repository secret `EXPO_TOKEN`.
2. **Once, for automatic iOS signing (recommended):** in App Store Connect → Users and Access → Integrations → App Store Connect API, the developer creates a key with the **App Manager** role and downloads the `.p8` file (only once). They add these secrets:
   - `ASC_API_KEY_P8_BASE64`: the `.p8` file in base64 (on Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`);
   - `ASC_KEY_ID` and `ASC_ISSUER_ID`: shown on that page;
   - `APPLE_TEAM_ID`: from developer.apple.com → Account → Membership details.

   With this key, Expo can create the iOS signing certificate and upload builds without an interactive Apple sign-in. If the first build still says the certificate is missing, the fallback is one interactive run on any computer with Node.js: `npx eas-cli@latest build --platform ios --profile production` in the app folder, signing in to Apple there. After that, Expo stores the certificate (the developer can download a backup any time with `npx eas-cli@latest credentials --platform ios`).
3. **Project files:** make sure `apps/<slug>/eas.json` exists and is committed:

   ```json
   {
     "cli": { "appVersionSource": "local" },
     "build": { "production": {} },
     "submit": { "production": {} }
   }
   ```

   `appVersionSource: local` keeps build numbers in `app.json`, under `scripts/bump-version.mjs`. After the first run, add the Expo project ID that the run's warning prints to `app.json` (`expo.extra.eas.projectId`) and commit it.
4. The App Store Connect app record must exist first (step 8.1).
5. **Build and upload:** trigger `ios.yml` with `app: <slug>` and `submit: true`. The GitHub job only queues the build, so it uses a few minutes. Expo builds on its servers, then uploads to App Store Connect. Give the developer the Expo build link from the run summary.
6. **Test on the iPhone with TestFlight (free):** once Apple has processed the upload (usually 5-30 minutes after the build), the developer adds themselves as an internal tester in App Store Connect → TestFlight, installs the TestFlight app, and tests the build fully, especially native features such as OCR, notifications and Shortcuts. Record what was tested in `RELEASES.md`.

**From the developer's own terminal instead** (on any computer with Node.js): `npx eas-cli@latest login`, then `npx eas-cli@latest build --platform ios --profile production --auto-submit` in the app folder.

#### On a Mac

Check `xcodebuild -version` meets Apple's minimum from step 1 (update Xcode from the Mac App Store if not; it's free). With the developer enrolled in the Apple Developer Program and signed in to Xcode (**Xcode → Settings → Accounts**) with that Apple ID:

```sh
cd apps/<slug>
npx expo prebuild --platform ios --clean
npx pod-install
open ios/*.xcworkspace
```

Then guide the developer in Xcode:
1. Select the app target. Under **Signing & Capabilities**, tick **Automatically manage signing** and choose their team. Xcode registers the bundle ID.
2. Set the run destination to **Any iOS Device (arm64)**, then **Product → Archive**.
3. In the Organizer: **Distribute App → App Store Connect → Upload**. Accept the defaults.

The App Store Connect record (step 8) has to exist before the upload, so if this is the first release, do step 8's "create the app" part first.

### 7. Google Play Console

Guide the developer through play.google.com/console, giving them the exact text to paste from `store/listing.md` at each step:

1. **Create app:** the Google Play title, default language, App, then Free or Paid. A free app can never become paid later, so confirm the choice against `spec.md`.
2. **Set up your app** (dashboard tasks):
   - privacy policy URL
   - app access (explain how to reach every feature, and give demo credentials if there's a login)
   - ads (yes or no)
   - content rating questionnaire (answers from `listing.md`)
   - target audience
   - Data safety (from the listing's Data safety section, which must match the code)
   - the government, financial, health and news declarations, if they apply
3. **Main store listing:** title, short description, full description, the 512 icon, the feature graphic, phone screenshots (and tablet screenshots, if you made them), category, and contact email.
4. **Developer verification.** Google is rolling out Android developer verification in late 2026; check Play Console's verification page and finish anything it asks for.
5. **Testing.** Personal developer accounts created after 13 November 2023 must run a **closed test** with at least 12 opted-in testers for 14 days in a row before they can apply for production access. Check the Console's dashboard for the current requirement. Create a closed testing track, upload the `.aab`, add testers by email list, and share the opt-in link with them. Testers must stay opted in for the 14 days in a row, and Google may check that they actually used the app, so ask for real testers (friends, family, colleagues) and give them something to try. Record the start date in `RELEASES.md` and remind the developer when the 14 days are up. (Organization accounts are exempt, but need a D-U-N-S number for a registered business.)
6. **Production:** create a release, upload the `.aab` (or promote the tested one), paste the release notes, choose countries, then send it for review.

### 8. App Store Connect

Guide the developer through appstoreconnect.apple.com:

1. **Create the app** (My Apps → **+** → New App): platform iOS, the App Store name, primary language, the bundle ID registered by Xcode, and a SKU (the slug works).
2. **App Information:** subtitle, category, content rights (does it use third-party content?), and the age rating questionnaire, answered from `listing.md`.
3. **Pricing and Availability:** price (free or paid) and countries. A paid app or in-app purchases need the **Paid Apps Agreement**, with banking and tax details, under **Business**. That's free, but it's paperwork.
4. **App Privacy:** privacy policy URL, then the data types from the listing's privacy label section, which must match the code.
5. **Version page:**
   - 6.9-inch iPhone screenshots (and 13-inch iPad screenshots, if the app supports iPad)
   - promotional text, description, keywords, support URL and copyright
   - the uploaded build (it appears after processing, usually 5-30 minutes)
   - App Review information: contact details, demo account if there's a login, and notes explaining anything a reviewer might not find
6. **Submit for Review.** Testing with TestFlight first is optional and free.

### 9. In-app purchases (only if the app sells something)

The product IDs are constants in `src/lib/purchases.ts`. Guide the developer to:
- create the same products in both consoles (Play Console → Monetize; App Store Connect → In-App Purchases or Subscriptions);
- create a free RevenueCat account (free until an app earns $2,500 a month), connect both stores, and put its public SDK keys into the constants in `purchases.ts`. These public keys are meant to ship in the app; they aren't secrets.

Then rebuild and re-upload, after running `node scripts/bump-version.mjs apps/<slug> build`.

### 10. Finish

Update `RELEASES.md` with what was submitted where, and what's waiting on review or on the closed test. Tell the developer what happens next: review usually takes 1-3 days on each store. If a store rejects the app, paste the rejection here and run `/update-app <slug> "address the review rejection: ..."`.
