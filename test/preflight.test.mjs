import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { emptyUsageTexts, minTargetSdk, missingProguardRules, permissionsNotRemoved, planSteps, targetSdk } from "../scripts/preflight.mjs";

test("reads Google Play's minimum target API from the real android.yml", () => {
  const min = minTargetSdk(readFileSync(new URL("../.github/workflows/android.yml", import.meta.url), "utf8"));
  assert.ok(Number.isInteger(min) && min >= 34, `got ${min}`);
  assert.equal(minTargetSdk('env:\n  MIN_TARGET_SDK: "36"\n'), 36);
  assert.equal(minTargetSdk("env: {}"), null);
});

test("reads React Native's target API", () => {
  assert.equal(targetSdk('[versions]\nminSdk = "24"\ntargetSdk = "36"\ncompileSdk = "37"\n'), 36);
  assert.equal(targetSdk("[versions]\n"), null);
});

test("finds blocked permissions the manifest still grants", () => {
  const manifest = `
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>`;
  assert.deepEqual(
    permissionsNotRemoved(manifest, ["android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_MEDIA_VIDEO"]),
    ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_MEDIA_VIDEO"],
  );
  assert.deepEqual(permissionsNotRemoved(manifest, undefined), []);
});

test("finds iOS permissions without an explanation text", () => {
  const plist = "<key>NSCameraUsageDescription</key>\n<string>Scan receipts</string>\n<key>NSFaceIDUsageDescription</key>\n<string> </string>";
  assert.deepEqual(emptyUsageTexts(plist), ["NSFaceIDUsageDescription"]);
});

test("finds ProGuard rules the plugin adds but the generated project lacks", () => {
  const plugin = "const RULES = `\n-dontwarn com.gemalto.jp2.**\n-keep class com.example.** { *; }\n`;";
  assert.deepEqual(missingProguardRules(plugin, "# rules\n-dontwarn com.gemalto.jp2.**\n"), ["-keep class com.example.** { *; }"]);
});

test("plans the steps in CI order", () => {
  const all = () => true;
  assert.deepEqual(planSteps("apps/x", { has: all, proPreview: true }), [
    "app name", "ci scripts", "maestro flows", "lockfile", "type check", "unit tests", "lint", "android project", "ios project",
    "walkthrough large", "walkthrough small", "walkthrough pro preview",
  ]);
  const none = () => false;
  assert.deepEqual(planSteps("apps/x", { has: none }), ["app name", "ci scripts", "lockfile", "type check", "unit tests", "lint", "android project", "ios project"]);
  assert.ok(!planSteps("apps/x", { has: all, walkthrough: false }).some((s) => s.startsWith("walkthrough")));
});
