import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { patchBuildGradle } from "../scripts/android-signing.mjs";

const original = readFileSync("test/fixtures/expo58-app-build.gradle", "utf8");

test("adds an env-based release signing config to a real Expo build.gradle", () => {
  const { text, changed } = patchBuildGradle(original);
  assert.equal(changed, true);
  // The release signing config sits inside signingConfigs, after debug.
  const sc = text.slice(text.indexOf("signingConfigs {"), text.indexOf("buildTypes {"));
  assert.match(sc, /debug \{[\s\S]*?\}\s*release \{[\s\S]*storeFile file\(System\.getenv\("ANDROID_KEYSTORE_PATH"\)\)/);
  // Debug builds keep the debug key; release builds switch when the secret is set.
  const bt = text.slice(text.indexOf("buildTypes {"));
  assert.match(bt, /debug \{\s*signingConfig signingConfigs\.debug\s*\}/);
  assert.match(bt, /release \{[\s\S]*?signingConfig System\.getenv\("ANDROID_KEYSTORE_PATH"\) \? signingConfigs\.release : signingConfigs\.debug/);
  assert.equal((text.match(/signingConfigs\.debug/g) || []).length, 2);
  // Braces stay balanced and nothing else in the file changed.
  const count = (s, c) => s.split(c).length - 1;
  assert.equal(count(text, "{") - count(text, "}"), count(original, "{") - count(original, "}"));
  assert.ok(text.includes("proguardFiles getDefaultProguardFile"));
});

test("is idempotent", () => {
  const once = patchBuildGradle(original).text;
  const twice = patchBuildGradle(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once);
});

test("handles a release build type without a signingConfig line", () => {
  const g = "android {\n    signingConfigs {\n        debug { }\n    }\n    buildTypes {\n        release {\n            minifyEnabled false\n        }\n    }\n}\n";
  const { text } = patchBuildGradle(g);
  assert.match(text, /release \{\n\s*signingConfig System\.getenv/);
});

test("fails clearly on an unexpected file", () => {
  assert.throws(() => patchBuildGradle("android { }"), /no signingConfigs block/);
});
