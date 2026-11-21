#!/usr/bin/env node
// Bumps an Expo app's version for a new store release: expo.version (semver),
// ios.buildNumber and android.versionCode. Both stores reject an upload whose
// build number isn't higher than the last one.
//
//   node scripts/bump-version.mjs apps/<slug> patch|minor|major|build
//
// "build" keeps the version and only raises the build numbers (for re-uploading
// a fixed build of the same version).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(version, kind) {
  const m = SEMVER.exec(version ?? "");
  if (!m) throw new Error(`expo.version "${version}" is not MAJOR.MINOR.PATCH`);
  const [maj, min, pat] = m.slice(1).map(Number);
  switch (kind) {
    case "major": return `${maj + 1}.0.0`;
    case "minor": return `${maj}.${min + 1}.0`;
    case "patch": return `${maj}.${min}.${pat + 1}`;
    case "build": return version;
    default: throw new Error(`Unknown bump "${kind}" (use patch, minor, major or build)`);
  }
}

export function bump(appJson, kind) {
  const expo = appJson.expo;
  if (!expo) throw new Error("app.json has no \"expo\" key");
  const before = {
    version: expo.version,
    buildNumber: expo.ios?.buildNumber ?? "0",
    versionCode: expo.android?.versionCode ?? 0,
  };
  const buildNumber = Number.parseInt(before.buildNumber, 10);
  if (!Number.isInteger(buildNumber)) throw new Error(`ios.buildNumber "${before.buildNumber}" is not a whole number`);
  if (!Number.isInteger(before.versionCode)) throw new Error(`android.versionCode "${before.versionCode}" is not a whole number`);

  expo.version = nextVersion(before.version, kind);
  expo.ios = { ...expo.ios, buildNumber: String(buildNumber + 1) };
  expo.android = { ...expo.android, versionCode: before.versionCode + 1 };
  return { before, after: { version: expo.version, buildNumber: expo.ios.buildNumber, versionCode: expo.android.versionCode } };
}

function main([dir, kind]) {
  if (!dir || !kind) {
    console.error("Usage: node scripts/bump-version.mjs apps/<slug> patch|minor|major|build");
    return 2;
  }
  const file = join(dir, "app.json");
  const appJson = JSON.parse(readFileSync(file, "utf8"));
  const { before, after } = bump(appJson, kind);
  writeFileSync(file, JSON.stringify(appJson, null, 2) + "\n");
  console.log(`version      ${before.version} -> ${after.version}`);
  console.log(`buildNumber  ${before.buildNumber} -> ${after.buildNumber}  (iOS)`);
  console.log(`versionCode  ${before.versionCode} -> ${after.versionCode}  (Android)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
