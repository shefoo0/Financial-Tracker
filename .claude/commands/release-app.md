---
description: Walk through releasing an app from apps/ to Google Play and the App Store, step by step (free tools only)
argument-hint: '<slug> [android|ios|both]'
---

Release the app in `apps/<slug>/` to the stores. Arguments: $ARGUMENTS (the slug, then `android`, `ios` or `both`; default `both`).

You do the steps that can be done on this computer, and you guide the developer through the ones they have to do themselves (signing, store websites, uploading). Go one step at a time. When a step needs the developer, say exactly what to do, then wait for them to say it's done before you go on. Keep a running log in `apps/<slug>/RELEASES.md` (create it if needed): version, build numbers, date, and each step's status.

## Resuming

`RELEASES.md` is also the checkpoint. If it shows a release in progress, resume from the first step not marked done, after checking that its outputs (screenshots, pages, build files) still exist.

## Rules

- **Free only.** The only costs are the developer's Apple Developer Program ($99/year) and Google Play developer account ($25 once). Don't use paid services or paid upload tools. Android builds happen on this computer and upload through the Play Console website. iOS builds happen in Xcode on a Mac, or, without a Mac, on **Expo's free cloud plan (iOS only, no payment method)** as described in step 6.
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

Needs Android Studio, which includes the Android SDK and a JDK. Check with `java -version` and that `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) is set; if not, tell the developer how to install and set them for their OS.

1. **Upload key (once per app).** If `~/.app-signing/<slug>-upload.jks` doesn't exist, ask the developer to run this in their own terminal and choose a strong password when asked:

   ```sh
   mkdir -p ~/.app-signing
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/.app-signing/<slug>-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Tell them to back up the `.jks` file and its password somewhere safe outside this computer (a password manager is good). Google Play App Signing holds the real app signing key, so a lost upload key can be reset, but only by contacting Google support.
2. **Gradle properties.** Ask the developer to add these lines to `~/.gradle/gradle.properties` (outside the repo) with their own password. Use the slug in upper case, with dashes turned into underscores, as the prefix:

   ```properties
   <SLUG>_UPLOAD_STORE_FILE=/full/path/to/.app-signing/<slug>-upload.jks
   <SLUG>_UPLOAD_KEY_ALIAS=upload
   <SLUG>_UPLOAD_STORE_PASSWORD=...
   <SLUG>_UPLOAD_KEY_PASSWORD=...
   ```
3. **Signing config plugin (once per app).** Write `apps/<slug>/plugins/with-android-release-signing.js`, an Expo config plugin using `withAppBuildGradle` from `expo/config-plugins`. It adds a `release` signing config that reads those four properties, and points `buildTypes.release.signingConfig` at it. Then register it under `plugins` in `app.json`. Doing this in a plugin means `prebuild --clean` can't wipe it.
4. **Build:**

   ```sh
   cd apps/<slug>
   npx expo prebuild --platform android --clean
   cd android && ./gradlew bundleRelease        # Windows: gradlew.bat bundleRelease
   ```

   Check the target API level the build uses (`grep -rn "targetSdk" android/build.gradle android/app/build.gradle android/gradle.properties`) meets the Google Play requirement from step 1.

   **Smoke test the release build** before uploading: if an emulator or phone is connected, run `./gradlew assembleRelease`, install `android/app/build/outputs/apk/release/app-release.apk` with `adb install -r`, open the app, and run the Maestro flows (`maestro test .maestro/`) if they exist. A crash on launch is the most common reason for rejection.

   The output is `android/app/build/outputs/bundle/release/app-release.aab`. Confirm it's signed with the upload key (`jarsigner -verify -verbose -certs <aab>` should name the upload certificate; it never needs the password). Copy it to `apps/<slug>/release/<version>-<versionCode>/` and make sure `release/`, `android/` and `ios/` are in the app's `.gitignore`.

### 6. iOS build

#### Without a Mac: Expo's free cloud plan

If `uname` isn't `Darwin`, build iOS on Expo's servers with the **free plan**. This is the one cloud service allowed, and only for iOS, because iOS apps can only be built on macOS. Rules:
- The developer's Expo account must **never have a payment method**. Never upgrade, buy build credits, or pick a priority build. The safety hook blocks paid options and non-iOS cloud builds.
- The free plan gives a limited number of builds a month in a slower queue. If the limit is reached, Expo stops building until the next month; it doesn't charge. So try changes on Android or in Expo Go first, and only build iOS for release candidates. Note each build in `RELEASES.md` so you can see how many are left.
- Anything that asks for a password or Apple sign-in, the **developer runs in their own terminal**. Never ask for, type or print passwords.

Steps:
1. The developer creates a free account at expo.dev (no card), then runs `npx eas-cli@latest login` in their own terminal.
2. In the app folder, run `npx eas-cli@latest init` (it links the project and adds its ID to `app.json`). Create `eas.json` if it doesn't exist:

   ```json
   {
     "cli": { "appVersionSource": "local" },
     "build": { "production": {} },
     "submit": { "production": {} }
   }
   ```

   `appVersionSource: local` means the build numbers come from `app.json`, so `scripts/bump-version.mjs` stays in charge of them.
3. The App Store Connect app record must exist first (do step 8.1 if it doesn't).
4. **First build (interactive, in the developer's terminal):** `npx eas-cli@latest build --platform ios --profile production`. Tell them how to answer:
   - sign in to their Apple Developer account (Apple ID and two-factor code, entered only in the terminal): **yes**;
   - generate a distribution certificate and provisioning profile: **yes**;
   - set up push notifications: **no**, unless the app uses remote push (local notifications don't need it).

   Expo stores these signing files for future builds. The developer can download a backup any time with `npx eas-cli@latest credentials --platform ios`.
5. **Later builds:** you can run `npx eas-cli@latest build --platform ios --profile production --non-interactive` yourself. Check the build log says Xcode 26 or later (Apple's minimum from step 1).
6. **Upload to App Store Connect:** the first time, the developer runs `npx eas-cli@latest submit --platform ios --latest` in their own terminal. It signs in to Apple and stores an App Store Connect API key with Expo for later uploads. After that, you can run it with `--non-interactive`.
7. **Test on the iPhone with TestFlight (free):** in App Store Connect → TestFlight, add the developer as an internal tester (no review needed), install the TestFlight app on the iPhone, and test the build fully, especially native features such as OCR, notifications and Shortcuts. Record what was tested in `RELEASES.md`.

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
