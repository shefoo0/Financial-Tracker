#!/usr/bin/env node
// Makes an Expo app's release build sign with the developer's upload key when
// the key is provided through environment variables (GitHub Actions secrets),
// and keep Expo's debug key otherwise, so test builds still work without it.
// Run after `npx expo prebuild --platform android`; safe to run twice.
//
//   node scripts/android-signing.mjs apps/<slug>/android/app/build.gradle
//
// Environment variables read by Gradle at build time:
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MARK = "// app-factory: upload-key signing";

const RELEASE_CONFIG = `        release {
            ${MARK} (from environment variables; unset = debug key)
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
`;

const USE_RELEASE = `signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug`;

// Index of the "}" closing the block whose "{" is at openIdx.
function blockEnd(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces in build.gradle");
}

export function patchBuildGradle(text) {
  if (text.includes(MARK)) return { text, changed: false };

  // 1. Add a release signing config inside `signingConfigs { ... }`.
  const sc = /\n(\s*)signingConfigs\s*\{/.exec(text);
  if (!sc) throw new Error("no signingConfigs block found");
  const scOpen = text.indexOf("{", sc.index);
  const scClose = blockEnd(text, scOpen);
  text = text.slice(0, scClose) + RELEASE_CONFIG + text.slice(scClose);

  // 2. Point the release build type at it.
  const bt = /\n\s*buildTypes\s*\{/.exec(text);
  if (!bt) throw new Error("no buildTypes block found");
  const btOpen = text.indexOf("{", bt.index);
  const btClose = blockEnd(text, btOpen);
  const rel = /\n\s*release\s*\{/.exec(text.slice(btOpen, btClose));
  if (!rel) throw new Error("no release build type found");
  const relOpen = text.indexOf("{", btOpen + rel.index);
  const relClose = blockEnd(text, relOpen);
  const body = text.slice(relOpen, relClose);
  const line = /signingConfig\s+signingConfigs\.\w+/;
  const newBody = line.test(body) ? body.replace(line, USE_RELEASE) : body.replace("{", `{\n            ${USE_RELEASE}`);
  text = text.slice(0, relOpen) + newBody + text.slice(relClose);
  return { text, changed: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/android-signing.mjs <android/app/build.gradle>");
    process.exit(2);
  }
  try {
    const { text, changed } = patchBuildGradle(readFileSync(file, "utf8"));
    if (changed) writeFileSync(file, text);
    console.log(changed ? `Release signing set up in ${file}` : `Already set up: ${file}`);
  } catch (err) {
    console.error(`${file}: ${err.message}`);
    process.exit(1);
  }
}
