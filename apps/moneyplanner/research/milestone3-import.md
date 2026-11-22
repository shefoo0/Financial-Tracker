# Milestone 3 research: statement import, OCR and live capture

Researched 2026-11-22 for Money Planner (Expo SDK 58, RN 0.88.1, New
Architecture, offline only, free only, UAE, English statements).

How this was checked: package versions, dates and native dependencies come
from the npm registry and the published tarballs (`npm view`, `npm pack`,
reading each `build.gradle` / `.podspec`), so they are first-hand. Policy and
bank facts come from web search. This session's network blocks
`support.google.com`, `developers.google.com` and `docs.expo.dev`, so for those
pages only search-result excerpts were read, not the full page. Re-read the two
Google Play pages in section 3 yourself before submitting any build that asks
for SMS or notification access.

---

## Summary of recommendations

| Area | Recommendation |
| --- | --- |
| OCR | **`expo-text-extractor` 2.0.0** (Expo module; Apple Vision on iOS, ML Kit through Play Services on Android). Wrap it in `src/import/ocr/` so it can be swapped. Fallback if offline-first-use matters more than size: `@infinitered/react-native-mlkit-text-recognition` (bundled model). |
| Text PDFs | **`expo-pdf-text-extract` 1.1.0** (PDFKit on iOS, PdfBox on Android; password support). Fallback: bundled pdf.js in `react-native-webview`. |
| Scanned PDFs | **`react-native-pdf-thumbnail` 2.0.0** (New Architecture only; PDFKit / PdfRenderer) to render pages to JPEG, then OCR. |
| Share sheet / "Open in" | **`expo-sharing` (already installed, 58.0.23)**: its config plugin now receives shared files (Android intent filters, iOS share extension) and `useIncomingShare()`. No extra package. |
| CSV / OFX / Excel | Pure TypeScript parsers; no native code. Excel (.xlsx) support is worth it because ENBD exports Excel. |
| SMS reading | **Drop for v1.** Possible on Play only by declaration, case by case; high risk for a personal account; nothing on iOS. |
| Notification reading | **Defer to v1.x as an opt-in Android "beta"**, after the first public release. |
| Apple Pay / Wallet | **Defer to v1.x**: Shortcuts "Transaction" automation + `expo-app-intents` (alpha). |
| Google Pay / Wallet | No API for third-party apps to read transactions; only through its notifications (see 3b). |

---

## 1. On-device OCR

### Comparison (versions from npm, 2026-11-22)

| Package | Latest | Last publish | Type | Android engine | iOS engine | New Arch / SDK 58 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `expo-text-extractor` (pchalupa) | 2.0.0 | 2026-02-28 | Expo module (Swift/Kotlin) | `com.google.android.gms:play-services-mlkit-text-recognition:19.0.1` (**unbundled**, Play Services) | **Apple Vision** `VNRecognizeTextRequest` | Expo modules run natively on the New Architecture; 2.0.0 was an "upgrade expo sdk" release; README says SDK 52+. Peer deps `*`. | Tiny API: `isSupported`, `extractTextFromImage(uri): Promise<string[]>` (lines only, no boxes). 72 stars, 3 open issues, one maintainer. iOS 15.1+. Works on emulator and simulator. |
| `@react-native-ml-kit/text-recognition` (a7medev) | 2.0.0 | 2025-09-01 | Classic RN native module (interop layer on New Arch) | `com.google.mlkit:text-recognition` **plus Chinese, Devanagari, Japanese, Korean** models, all **bundled** (16.0.1) | Google ML Kit pods (`GoogleMLKit/TextRecognition*`) | No codegen spec; runs through the New Architecture interop layer. No config plugin. | Returns blocks / lines / elements with frames (good for column layout). But it bundles **all five script models** (roughly 4 MB per script per ABI, see below), so it is the heaviest option. iOS 15.5+. 19 open issues. |
| `@infinitered/react-native-mlkit-text-recognition` | 5.0.1 | 2025-11-25 | Expo module | `com.google.mlkit:text-recognition:16.0.1` (**bundled, Latin only**) | Google ML Kit pod | Expo module | Returns blocks / lines with frames. Part of Infinite Red's maintained ML Kit family. Needs its `-core` package. |
| `expo-mlkit-ocr` (rbayuokt) | 0.2.7 | 2026-05-06 | Expo module | bundled ML Kit Latin | ML Kit pod | Expo module | Needs `expo-build-properties` for iOS 16 target. Small project, 0.x. |
| `react-native-vision-camera` 5.2.4 + `react-native-vision-camera-ocr-plus` 2.1.2 | 2026-10/11 | Nitro modules + worklet frame processors | ML Kit | ML Kit | Needs `react-native-nitro-modules`, `react-native-vision-camera-worklets`, worklets ≥0.8 (app has 0.13.0) | **Live** camera OCR. Overkill: statements are still images; adds a camera stack and frame-processor complexity for no gain. |
| Apple Vision via own Expo module | n/a | — | local module in `modules/` | — | Vision; on **iOS 26** also `RecognizeDocumentsRequest`, which returns document structure **including tables with cells grouped into rows** | Expo module | Only worth writing later, for iOS-26 table reading of statement photos. `expo-text-extractor` already uses Vision for plain lines. |

Sources: npm registry and tarballs for every package above;
[expo-text-extractor README](https://github.com/pchalupa/expo-text-extractor);
[react-native-ml-kit repo](https://github.com/a7medev/react-native-ml-kit);
[Infinite Red text recognition docs](https://docs.infinite.red/react-native-mlkit/text-recognition/);
[expo-mlkit-ocr](https://socket.dev/npm/package/expo-mlkit-ocr);
[react-native-vision-camera-ocr-plus](https://app.unpkg.com/react-native-vision-camera-ocr-plus@1.0.5/files/README.md);
[Apple: RecognizeDocumentsRequest](https://developer.apple.com/documentation/vision/recognizedocumentsrequest.md),
[Apple: Recognize tables within a document](https://developer.apple.com/documentation/vision/recognize-tables-within-a-document.md),
[WWDC25 session 272](https://developer.apple.com/videos/play/wwdc2025/272/).

### Android app size: bundled vs Play Services model

Google's ML Kit text recognition page lists, per script and per CPU
architecture, about **260 KB** for the unbundled (Play Services) library and
about **4 MB** for the bundled model. The AAB on Play splits by ABI, so a user
downloads one ABI's worth; the test **APK** from `android.yml` carries every
ABI, so a bundled model shows up several times there.

- Unbundled (`expo-text-extractor`): the model is downloaded by Google Play
  Services. Without extra setup it downloads **on first use and recognition
  fails until it finishes**, which matters for an offline app. Fix: add the
  manifest meta-data `com.google.mlkit.vision.DEPENDENCIES` = `ocr`, so Play
  downloads the model right after install from the Play Store (a small config
  plugin, or `ModuleInstallClient` to check/request it). Needs Google Play
  Services (fine for UAE Play users; not on Huawei phones without GMS).
- Bundled (Infinite Red, `expo-mlkit-ocr`): works offline from the first
  launch, costs ~4 MB per ABI for Latin.
- `@react-native-ml-kit/text-recognition` bundles five scripts: ~20 MB per ABI.
  Avoid unless you patch the Gradle file.

Sources: [ML Kit text recognition v2, Android](https://developers.google.com/ml-kit/vision/text-recognition/v2/android),
[ML Kit installation paths](https://developers.google.com/ml-kit/tips/installation-paths),
[Reduce ML Kit app size](https://developers.google.com/ml-kit/tips/reduce-app-size),
[Capawesome ML Kit text recognition notes](https://capawesome.io/docs/sdks/capacitor/mlkit/text-recognition/).

### Recommendation

Use **`expo-text-extractor`** behind an interface in `src/import/ocr/`
(`recognize(uri) → string[]`, with a Jest/Expo Go/web mock), because:
it is an Expo module (no New-Architecture interop risk), it was updated for
the current SDK line in 2026, it uses the native engine on each platform
(Apple Vision on iOS, no Google pods; tiny Android footprint), and it is free
and offline after the model is installed. Add a 10-line config plugin
(`plugins/with-mlkit-ocr-dependency.js`) for the `DEPENDENCIES = ocr`
meta-data.

Its weaknesses: lines only (no bounding boxes), so column reconstruction from
photos is up to the parser, and a single maintainer. If the spike in T12
shows that line order loses the amount column on real UAE statements, switch
to `@infinitered/react-native-mlkit-text-recognition` (bounding boxes; bundled
Latin model, +~4 MB per ABI) without changing callers. Pin the exact version
and run the spike on the Android emulator in CI (Maestro) and the iOS simulator
(`ios-simulator.yml`), both supported by the package.

---

## 2. PDF statements

UAE e-statements are usually **digital (text) PDFs**, often **password
protected** (Emirates NBD: password is the primary CIF ID, the middle 8 digits
of the account number; FAB, per third-party guides: last 4 digits of the
account + DDMM of birth date). So password support is a must.

### Options

| Approach | Package | Notes |
| --- | --- | --- |
| Native text extraction | **`expo-pdf-text-extract` 1.1.0** (2026-05-20), Expo module, PDFKit on iOS, `com.tom-roush:pdfbox-android:2.0.27.0` on Android | `extractText(path, password?)`, `extractTextFromPage`, `getPageCount`, `extractTextWithInfo`; errors `PASSWORD_REQUIRED` / `INCORRECT_PASSWORD`; accepts `file://` and `content://`. Dev build only (fine: CI builds from prebuild). Young project (Jan 2026), one maintainer. PdfBox-android adds a few MB to the APK. |
| pdf.js in a WebView | `pdfjs-dist` 6.5.438 + `react-native-webview` 14.0.1 | Fully offline if the build is bundled as an asset: `pdf.min.mjs` 474 KB + `pdf.worker.min.mjs` 1.27 MB (modern build; legacy build ~1.9 MB total). `getDocument({data, password})` → `page.getTextContent()` gives text **with x/y positions** (great for columns) and `page.render()` to a canvas → `toDataURL()` gives page images for OCR. Costs: you write the HTML + `postMessage` bridge yourself, file bytes cross the bridge as base64, and the WebView must load local assets (`allowFileAccess`, `originWhitelist`). No ready-made package does text extraction. |
| `react-native-pdf` 7.0.5 | viewer only | Shows PDFs; no text API. Not needed. |

Scanned (image-only) PDFs: detect "no text" (empty or < ~20 characters per
page), then render each page to an image and OCR it.
**`react-native-pdf-thumbnail` 2.0.0** (2026-10-03) does exactly this with
PDFKit (iOS) and Android's built-in `PdfRenderer`, no extra runtime deps,
**New Architecture required** (matches this app), no config plugin, CI-tested
with Expo prebuild: `PdfThumbnail.generate(path, page, { maxWidth })` → JPEG
`file://` URI + size. Render at ~2000 px width for OCR. Note: Android
`PdfRenderer` cannot open password-protected PDFs, so for an encrypted scanned
PDF, ask the user to export an unlocked copy (rare case) or use the pdf.js
render path.

Sources: npm registry and tarballs;
[expo-pdf-text-extract README](https://cdn.jsdelivr.net/npm/expo-pdf-text-extract@1.1.0/README.md);
[react-native-pdf-thumbnail](https://github.com/songsterq/react-native-pdf-thumbnail);
[Expo forum: offline pdf.js in a WebView](https://forums.expo.dev/t/pdf-offline-viewer/4087);
[rn-pdf-reader-js (pdf.js in WebView pattern)](https://github.com/xcarpentier/rn-pdf-reader-js);
[Emirates NBD e-statements (password = CIF ID)](https://www.emiratesnbd.com/en/ways-of-banking/e-statements);
[FAB statement guide (password format, third party)](https://www.paisabazaar.ae/bank-accounts/articles/fab-bank-statement).

### Recommendation

Start with **`expo-pdf-text-extract`** (text, page by page, with password
prompt) + **`react-native-pdf-thumbnail`** (render scanned pages) +
`expo-text-extractor` (OCR). Keep `src/import/pdf/` behind an interface
`extractPages(uri, password?) → { pages: string[], isScanned }`.

Fallback / phase 2: the spec's bundled-pdf.js WebView. Its one real advantage
is per-word **x/y positions**, which make column parsing of multi-column
statements far more reliable than flat text. Spike both on two real UAE
statements in T11 (one ENBD, one ADCB or FAB): if flat text from PdfBox/PDFKit
keeps each transaction on one line in date-description-amount order, keep the
native module; if not, switch to pdf.js. Note pdf.js needs a recent WebView
(Android System WebView and iOS WKWebView are both evergreen; use the
`legacy/build` if older devices fail).

---

## 3. Live capture: what is allowed

### 3a. Google Play: READ_SMS / RECEIVE_SMS

- SMS permissions are **restricted**: an app must normally be the default SMS
  handler, and exceptions are reviewed and granted **case by case** by Google
  Play, through the **Permissions Declaration Form** (Play Console → App
  content → Sensitive app permissions). Every release that ships the permission
  needs the declaration approved before it rolls out, bug fixes included.
- The exceptions table still lists **"SMS-based money management (e.g. apps
  that track and manage budget)"**; a budgeting app's maintainer rechecked the
  live page on 2026-11-21 and found it still listed. A newer policy preview
  (effective 2027-01-27, which removes call-log account verification) keeps
  the money-management row. The excerpts did not show that row's permission
  cell clearly; older versions listed READ_SMS / RECEIVE_SMS (plus MMS/WAP
  push). Check the live table.
- What reviewers want (Google's text plus developer reports): the SMS feature
  must be the **core, prominently promoted** feature, stated in the store
  description and in the form; a **demo video** of the feature; an in-app
  **prominent disclosure** and consent before asking; the store listing must
  match the declared use (a common rejection reason: "store listing information
  does not match the core functionality for your declared use case"); and data
  use limited to that purpose (our offline design helps).
- Risks for this developer: a personal account, a new app, and a planner whose
  core is forecasting, not SMS parsing, so the "core functionality" test is
  weak. A rejection blocks the whole release (or forces an SMS-free build);
  repeated policy violations can count against the developer account. Every
  release then waits on the declaration. Adds a 12-tester / 14-day closed test
  dependency on top (personal accounts created after 2023-11-13).
- Alternatives: the **SMS User Consent API** and **SMS Retriever API** only
  read one-time codes addressed to your app; they cannot read bank
  transaction SMS. Users can still **share** a bank SMS text into the app
  (Android share sheet → `text/plain`) and the parser handles it: no permission.
- iOS: no SMS access at all (only the OTP autofill system).

Verdict: **drop SMS reading from v1.** Offer "share an SMS to Money Planner"
instead (free, no review). Revisit only as a separate, clearly promoted
feature after release, with a closed-test build first.

Sources: [Play: Use of SMS or Call Log permission groups](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en),
[Play: SMS/Call Log exceptions](https://support.google.com/googleplay/android-developer/answer/9047303),
[Play: policy preview (2027-01-27)](https://support.google.com/googleplay/android-developer/answer/17225965),
[Play: Permissions and APIs that access sensitive information](https://support.google.com/googleplay/android-developer/answer/16558241),
[Budgy PR #49: READ_SMS for money management, rechecked 2026-11-21](https://github.com/OMokhtarr/Budgy/pull/49),
[khata issue #119: SMS declaration and demo video](https://github.com/priyendu7/khata/issues/119),
[Fixing SMS permission rejections (third party)](https://getresubmit.com/guides/google-play-sms-call-log-permissions-rejection),
[Developer report: SMS use case did not qualify](https://dev.to/zeta_byte/ive-been-working-on-a-personal-finance-app-called-finvantage-and-i-recently-hit-a-roadblock-4mjh),
[Play: app testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465).

### 3b. Android NotificationListenerService (bank app / Google Wallet notifications)

- Not a runtime permission: the app declares a service with
  `BIND_NOTIFICATION_LISTENER_SERVICE`, and the **user grants "Notification
  access"** on a system settings page (open it with `expo-intent-launcher`,
  `android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`).
- Play policy: no SMS-style declaration form for notification access was
  found; it falls under the general rules (request only what a promoted
  feature needs, User Data policy, prominent disclosure + consent before the
  settings page, Data safety form). Lower formal barrier than SMS, but
  reviewers can still reject an unexplained listener.
- Platform limits:
  - **Restricted settings** (Android 13+): apps installed from an APK file
    (our test APK installed from GitHub Actions) cannot be granted notification
    access until the user taps "Allow restricted settings" in App info;
    Android 15's Enhanced Confirmation Mode tightens this. Play installs are
    not affected. So tests need that extra step.
  - **Android 15+ hides "sensitive" notifications (OTPs) from listeners**
    without the system-only `RECEIVE_SENSITIVE_NOTIFICATIONS`. Bank transaction
    alerts that also contain codes may arrive redacted.
  - The service runs while the app is not open; the JS side cannot run there
    without a headless task, so a native module should store each matching
    notification (package filter + text) in a small native queue/SQLite and the
    app parses it on next launch.
- How others do it: Bluecoins and BudgetBakers (Wallet) read bank-app
  notifications with a listener and explain why in-app; Bluecoins also reads
  SMS. Walnut (now **axio**) built its product on SMS parsing in India.
  These are established, organisation-account apps with long policy history.
- Packages: `react-native-android-notification-listener` 5.0.1 (last publish
  2022, peer React 18: stale) and `expo-android-notification-listener-service`
  1.1.0 (2025-01): neither is safe for RN 0.88. A local Expo module
  (`modules/notification-capture/`, Kotlin, ~150 lines) would be needed.
- Coverage in the UAE: most bank alerts are SMS, not app notifications, and
  many bank apps only notify for some events, so capture would be partial.

Verdict: **defer to v1.x**, Android only, opt-in, labelled beta, after the
first public release and its closed test.

Sources: [Android: NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService),
[Play: Permissions and APIs that access sensitive information](https://support.google.com/googleplay/android-developer/answer/16558241),
[Play: User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311),
[Kaspersky: Restricted settings in Android 13 and 14](https://kaspersky.com/blog/android-restricted-settings/49991),
[Android Authority: Android 15 restricted settings](https://androidauthority.com/android-15-restricted-settings-sideloading-3481098),
[Android Authority: Android 15 sensitive notifications](https://www.androidauthority.com/android-15-sensitive-notifications-3416414),
[KDE Connect bug: OTP notifications hidden on Android 15](https://bugs.kde.org/show_bug.cgi?id=495146),
[Bluecoins: bank notifications](https://ram.bluecoinsapp.com/guide/bank-notifications/),
[BudgetBakers: notification access](https://support.budgetbakers.com/hc/en-us/articles/27357560590098-Notification-Access-Permission),
[SMS expense tracking apps 2026 (axio / Walnut)](https://getfinny.app/blog/sms-expense-tracking-app).

### 3c. iOS

- No access to SMS or other apps' notifications. No public API to read Apple
  Pay / Wallet transactions directly. (Apple's FinanceKit needs an
  Apple-approved entitlement and, as far as known, covers only Apple's own
  card/cash accounts in a few countries; not checked in this session, and not
  relevant to UAE bank cards.)
- **Shortcuts personal automation "Transaction"** (iOS 17+): runs when the user
  taps a Wallet card; the shortcut can pass **Name, Amount, Merchant, Card**
  to an app's App Intent. The user builds the automation themselves (we ship
  a guide or a shared shortcut link). Developer reports: the trigger
  sometimes **times out** waiting for the Wallet notification (some issuers
  post it late), it can keep asking "Allow once / Always allow", and it
  **cannot be tested in the simulator**. Apps like WalletPal and PayShare
  ship this.
- Expo support in 2026: **`expo-app-intents` 0.5.18** (Expo's own package,
  SDK 58, **alpha**, "frequent breaking changes"; iOS 16.4+). Swift intents
  live in an `app-intents/` folder compiled into the app target (inline
  modules); `perform()` calls `AppIntentDispatcher.shared.dispatch(...)`,
  which queues the invocation natively, and JS reads it with
  `useAppIntents()` (handles invocations captured while JS was cold). That is
  the right shape: the intent saves `{amount, merchant, card, date}` without
  opening the app, and the app shows them in the review screen next time.
  Reported to need a recent Xcode (check against `ios-simulator.yml`'s runner).
  `@bacons/apple-targets` 5.0.0 is the alternative for extension targets but is
  "highly experimental".
- **Share sheet and "Open in"**: `expo-sharing`'s config plugin (already a
  dependency) adds an iOS share extension (own bundle id + App Group) and
  `useIncomingShare()`; it also handles Android `ACTION_SEND` MIME types.
  Separately, `CFBundleDocumentTypes` + `UTImportedTypeDeclarations` in
  `ios.infoPlist` and `android.intentFilters` (VIEW for `application/pdf`,
  `text/csv`, `text/comma-separated-values`, OFX) make the app appear in
  "Open in" lists. The iOS share extension needs its own provisioning profile
  when signed with the paid Apple program (EAS handles multi-target
  credentials); the simulator build needs no signing.

Sources: [Apple forum: Transaction automation timeouts](https://developer.apple.com/forums/thread/765516),
[Apple forum: testing the Wallet transaction shortcut in the simulator](https://developer.apple.com/forums/thread/746889),
[Apple forum: transaction data in App Intents](https://developer.apple.com/forums/thread/773797),
[Apple forum: "Always Allow" not persisting](https://developer.apple.com/forums/thread/850369),
[Apple forum: flaky Transaction + AppIntent](https://developer.apple.com/forums/thread/797233),
[AppleInsider: iOS 17 Shortcuts transaction trigger](https://appleinsider.com/inside/ios-17/tips/how-to-use-ios-17s-new-shortcuts-features-to-control-displays-record-spending-and-more),
[WalletPal: Apple Pay automation guide](https://walletpalapp.github.io/apple-pay-expense-tracker-shortcuts.html),
[Expo: App Intents (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/app-intents/),
[Expo blog: Introducing Expo App Intents](https://expo.dev/blog/introducing-expo-app-intents),
[Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58),
[expo-apple-targets](https://github.com/EvanBacon/expo-apple-targets);
`expo-app-intents` and `expo-sharing` READMEs/CHANGELOG from the npm tarballs.

---

## 4. What UAE banks let customers export (public sources, 2026)

| Bank | Export from personal app / online banking | Confidence |
| --- | --- | --- |
| Emirates NBD (ENBD X app) | Monthly e-statements are **PDF by email, password = primary CIF ID**. App: Recent transactions → "View All" → **export to Excel** (bank's reply in App Store reviews; one user could not find it for credit cards). businessONLINE (business only): PDF, Excel, CSV. | Medium |
| ENBD credit cards | Card e-statements **PDF by email only**; duplicates up to a year via self-service (fee). No CSV found. | Medium |
| Liv / Liv X (ENBD) | No public documentation of the format; stamped statements requestable in app; reviews report statement issues. Assume PDF. | Low |
| ADCB | App: Accounts → Services → E-statement → date range → **PDF download** (digitally stamped); monthly PDF e-statement by email. Excel only seen for investment-dashboard reports. | Medium |
| FAB | App "Statements": **PDF** (current month, prior month, annual); stamped statements; PDF password (third party): last 4 of account + DDMM of birth. From 2025-11-01 key services are app-only. No Excel found. | Medium |
| Mashreq (Mashreq UAE app / NEO) | Monthly **PDF e-statement by email**; e-statements in app; no Excel/CSV documentation found. | Low |
| Wio Personal | Nothing public about statement format. Assume PDF; test with a real user. | Low |

No UAE retail bank was found offering **OFX/QFX or CSV** to personal
customers. So the realistic order of importance is: **PDF (text, password
protected) > Excel (.xlsx, ENBD) > photos/screenshots of the app's
transaction list > CSV/OFX** (keep CSV/OFX for Wise, other apps, and
spreadsheets the user makes; they are cheap to parse).

Sources: [ENBD: all about your account statement](https://www.emiratesnbd.com/en/help-and-support/all-about-your-account-statement),
[ENBD: e-statements](https://www.emiratesnbd.com/en/ways-of-banking/e-statements),
[ENBD: credit card statement](https://www.emiratesnbd.com/en/help-and-support/credit-card-statement),
[ENBD X on the App Store (reviews)](https://apps.apple.com/ae/app/emirates-nbd/id505092748),
[ENBD businessONLINE statements guide](https://www.emiratesnbd.com.sa/-/media/enbd/ksa/pdf/businessonline/ksa_how_to_access_your_statements.pdf),
[Liv on the App Store](https://apps.apple.com/ae/app/liv-bank/id1231846103),
[ADCB e-statement](https://www.adcb.com/en/tools-resources/e-statement/),
[FAB mobile banking](https://bankfab.com/en-ae/personal/help-and-support/digital-banking/mobile-banking),
[FAB statement guide (third party)](https://www.paisabazaar.ae/bank-accounts/articles/fab-bank-statement),
[Mashreq Neo Simple Account KFS](https://www.mashreq.com/-/jssmedia/pdfs/neo/accounts-deposits/Neo-Simple-Account-EN-KFS.ashx),
[Mashreq UAE on the App Store](https://apps.apple.com/ae/app/mashreq-uae/id378549193),
[Wio Personal on the App Store](https://apps.apple.com/ae/app/wio-personal/id1658472726),
[Wio support](https://www.wio.io/support/).

---

## 5. Recommended milestone 3 plan

Everything below is free, offline, and works with the existing `android.yml`
(prebuild + Gradle, config plugins applied) and `ios-simulator.yml`. "Needs a
native build" means it does not run in Expo Go or on the web, so those paths
use mocks; it does **not** mean an EAS development build.

### Ship in v1 (ordered)

1. **T10 parsers first (pure TS, Jest only, no native code).** CSV with column
   mapper (hand-written RFC 4180 reader or `papaparse` 5.7.1), OFX/QFX (SGML +
   XML), statement text → rows (DD/MM/YYYY, DD MMM YYYY, DD-MM-YY, "Cr/Dr",
   "AED 1,234.50", trailing minus, separate debit/credit columns), templates
   per user-named source, duplicate detection, category rules. Plus "shared
   SMS text" as just another text input. Fixtures: anonymised lines from real
   ENBD/ADCB/FAB PDFs. Risk: statement layout variety; mitigate with the
   per-source template and the editable review screen.
   Optional: Excel (.xlsx) for ENBD exports. A .xlsx is a zip of XML; use
   SheetJS CE from its own CDN tarball (the npm `xlsx` 0.18.5 is old) or a
   small reader with `fflate`. Decide in T10; it is pure JS either way.
2. **T13 import flow and review screen**, fed by `expo-document-picker`
   (already installed; types `application/pdf`, `text/csv`,
   `text/comma-separated-values`, `application/vnd.ms-excel`,
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
   `application/x-ofx`, `*/*` fallback) and `expo-file-system`. Runs in Expo Go
   and the web build for CSV/OFX, so Maestro and web walkthroughs can test it.
3. **T11 PDF text**: `expo-pdf-text-extract` with a password prompt
   (remember nothing; the password is used once and dropped). Detect scanned
   pages. Spike against pdf.js only if line order is bad. Risk: young package
   → pin version, wrap it, keep the pdf.js fallback ready.
4. **T12 OCR**: `expo-image-picker` (library + camera; no separate
   `expo-camera` needed) → `expo-text-extractor`; scanned PDF pages via
   `react-native-pdf-thumbnail` → OCR. Mock for Jest/Expo Go/web. Add the
   ML Kit `DEPENDENCIES=ocr` meta-data plugin. Show "OCR is checked by you" in
   the review screen; check totals (sum of rows vs statement total when found).
   Risk: OCR accuracy on photos of tables; mitigate with crop guidance,
   per-line edit, and the bounding-box fallback package.
5. **Share sheet / "Open in"**: enable `expo-sharing`'s receive plugin
   (Android single-share MIME types; iOS share extension with App Group) and
   document types / intent filters, then route incoming files and text to the
   import flow with `useIncomingShare()`. Risk: iOS share extension adds a
   second target (check `ios-simulator.yml` still builds; for `ios.yml`
   EAS needs credentials for the extension bundle id).
6. Review, tests, Android test build (`android.yml`, `build: test`), then
   `ios-simulator.yml` at the milestone end.

### Defer (v1.x, after first public release)

- Apple Pay via Shortcuts "Transaction" + `expo-app-intents` (alpha; real
  device and Apple Pay card needed to test; no iPhone available now).
- Android notification capture (local Kotlin module, opt-in, beta).
- iOS 26 `RecognizeDocumentsRequest` table reading (local Swift module).

### Drop

- READ_SMS / RECEIVE_SMS (Play declaration, case-by-case, weak "core feature"
  claim for a planner, personal account). Replaced by "share SMS text".
- Live camera OCR (`react-native-vision-camera` frame processors).
- `@react-native-ml-kit/text-recognition` (bundles five script models).
- Any cloud OCR or bank-aggregation API (paid / keys; against the money rules).

### Exact packages and config

```bash
cd apps/moneyplanner
EXPO_OFFLINE=1 npx expo install expo-image-picker   # 58.0.10
npm install --save-exact expo-text-extractor@2.0.0 expo-pdf-text-extract@1.1.0 react-native-pdf-thumbnail@2.0.0
# optional, T10: papaparse@5.7.1 (+ @types/papaparse)
# only if the pdf.js fallback is chosen: EXPO_OFFLINE=1 npx expo install react-native-webview; npm i -E pdfjs-dist@6.5.438
```

`app.json` additions (sketch):

```jsonc
"plugins": [
  // existing ...
  ["expo-image-picker", {
    "photosPermission": "Money Planner reads the statement photo you choose, on your phone only.",
    "cameraPermission": "Money Planner uses the camera to photograph a statement. The photo stays on your phone."
  }],
  ["expo-sharing", {
    "android": { "enabled": true,
      "singleShareMimeTypes": ["application/pdf", "text/csv", "text/comma-separated-values", "text/plain",
        "image/*", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/x-ofx"] },
    "ios": { "enabled": true, "appGroupId": "group.com.shefoo.moneyplanner",
      "activationRule": { "supportsFileWithMaxCount": 1, "supportsImageWithMaxCount": 1, "supportsText": true } }
  }],
  "./plugins/with-mlkit-ocr-dependency"   // <meta-data com.google.mlkit.vision.DEPENDENCIES = "ocr">
],
"android": {
  "intentFilters": [{ "action": "VIEW", "category": ["DEFAULT", "BROWSABLE"],
    "data": [{ "mimeType": "application/pdf" }, { "mimeType": "text/csv" }, { "mimeType": "text/comma-separated-values" }] }]
},
"ios": { "infoPlist": { "CFBundleDocumentTypes": [ /* PDF, CSV, OFX */ ], "LSSupportsOpeningDocumentsInPlace": false } }
```

(Check the exact option names against `expo-sharing`'s
`plugin/build/sharingPlugin.types.d.ts` at install time; the names above
are from version 58.0.23. `expo-text-extractor`, `expo-pdf-text-extract` and
`react-native-pdf-thumbnail` need no config plugin. No new Android
permissions: the photo picker and camera intents do not need
`READ_MEDIA_IMAGES`; keep it out of the manifest, since Play restricts that
permission too.)

### Build notes

- All chosen packages autolink in `expo prebuild`, so the existing
  `android.yml` APK and `ios-simulator.yml` build include them; no EAS
  development build is needed. Expo Go and web: mocks only (gate with
  `Platform.OS === 'web'` / a `try` around `requireNativeModule`).
- Check `minSdkVersion` ≥ 24 (`react-native-pdf-thumbnail`); RN 0.88 already
  uses a higher minimum.
- Watch APK size in the `android.yml` artifact before/after (PdfBox ~ a few MB;
  ML Kit unbundled ~260 KB per ABI).
- Data safety form: no new data types collected (all on device), but the
  privacy page should say statements and photos are read on the phone only.
