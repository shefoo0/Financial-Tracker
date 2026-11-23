#!/usr/bin/env node
// Runs, here and for free, every check the GitHub workflows run (android.yml
// and ios-simulator.yml), in the same order, so the device run passes on the
// first try. A device run costs ~40 minutes; this takes a few minutes.
//
//   node scripts/preflight.mjs apps/<slug> [--pro-preview] [--no-walkthrough]
//
// Steps (CI's step name in brackets):
//   1. app name and package.json           [Check the app name]
//   2. Maestro flows against the source    [Check the Maestro flows against the app]
//   3. dependencies match the lockfile     [Install: npm ci]
//   4. type check, unit tests              [Type check and unit tests]
//   5. lint (errors only)                  (not in CI; the code reviewer expects it)
//   6. Android project generation          [Generate the Android project]: config plugins,
//      upload-key signing patch, ProGuard rules, blocked permissions, target API level
//   7. iOS project generation              (Expo's cloud runs it in ios-simulator.yml):
//      config plugins, permission explanation texts
//   8. web walkthrough on a large phone and on a 320x640 phone (the CI emulator's size),
//      plus the Pro preview build with --pro-preview      [Run the flows on an emulator]
//
// Only GitHub can do the native compile (Gradle/R8, Xcode) and the real emulator and
// simulator: the summary says so. Exit code 1 if any step fails.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Google Play's minimum target API, read from android.yml so the two never drift. */
export function minTargetSdk(workflowText) {
  const m = workflowText.match(/MIN_TARGET_SDK:\s*"?(\d+)"?/);
  return m ? Number(m[1]) : null;
}

/** The target API React Native builds with (node_modules/react-native/gradle/libs.versions.toml). */
export function targetSdk(versionsToml) {
  const m = versionsToml.match(/^targetSdk\s*=\s*"(\d+)"/m);
  return m ? Number(m[1]) : null;
}

/** Blocked permissions (app.json android.blockedPermissions) that the generated manifest still grants. */
export function permissionsNotRemoved(manifest, blocked) {
  return (blocked ?? []).filter((p) => {
    const tags = manifest.match(new RegExp(`<uses-permission[^>]*android:name="${p.replace(/\./g, "\\.")}"[^>]*>`, "g")) ?? [];
    return !tags.some((t) => t.includes('tools:node="remove"'));
  });
}

/** iOS permission keys whose explanation text is empty (Apple rejects these). */
export function emptyUsageTexts(plist) {
  const out = [];
  for (const m of plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)) {
    if (!m[2].trim()) out.push(m[1]);
  }
  return out;
}

/** `-dontwarn`/`-keep` rules the app's ProGuard plugin adds that are missing from the generated file. */
export function missingProguardRules(pluginText, generated) {
  const rules = [...pluginText.matchAll(/(-(?:dontwarn|keep)[^\n'"`]*)/g)].map((m) => m[1].trim());
  return rules.filter((r) => !generated.includes(r));
}

/** The steps to run for an app, in CI order. */
export function planSteps(appDir, { proPreview = false, walkthrough = true, has = existsSync } = {}) {
  const steps = ["app name", "lockfile", "type check", "unit tests", "lint", "android project", "ios project"];
  if (readdirSafe(join(appDir, ".maestro"), has).length) steps.splice(1, 0, "maestro flows");
  if (walkthrough && has(join(appDir, "e2e-web", "walkthrough.mjs"))) {
    steps.push("walkthrough large", "walkthrough small");
    if (proPreview) steps.push("walkthrough pro preview");
  }
  return steps;
}

function readdirSafe(dir, has) {
  if (!has(dir)) return [];
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".yaml"));
  } catch {
    return ["?"]; // a test's fake `has` says it exists
  }
}

function run(cmd, args, cwd, env = {}) {
  console.log(`\n$ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  return r.status === 0;
}

/** Expo prebuild rewrites package.json scripts: put the file back afterwards. */
function prebuild(appDir, platform) {
  const pkg = join(appDir, "package.json");
  const backup = `${pkg}.preflight-bak`;
  copyFileSync(pkg, backup);
  try {
    return run("npx", ["expo", "prebuild", "--platform", platform, "--clean", "--no-install"], appDir, { EXPO_OFFLINE: "1", CI: "1" });
  } finally {
    copyFileSync(backup, pkg);
    rmSync(backup);
  }
}

function checkAndroid(appDir) {
  const problems = [];
  if (!prebuild(appDir, "android")) return ["expo prebuild --platform android failed (see above)"];
  const gradle = join(appDir, "android", "app", "build.gradle");
  if (!run("node", [join(ROOT, "scripts", "android-signing.mjs"), gradle], appDir)) problems.push("android-signing.mjs failed");
  const app = JSON.parse(readFileSync(join(appDir, "app.json"), "utf8")).expo;
  const manifest = readFileSync(join(appDir, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  for (const p of permissionsNotRemoved(manifest, app.android?.blockedPermissions)) problems.push(`blocked permission still in the manifest: ${p}`);
  const plugin = join(appDir, "plugins", "with-proguard-rules.js");
  const rules = join(appDir, "android", "app", "proguard-rules.pro");
  if (existsSync(plugin) && existsSync(rules)) {
    for (const r of missingProguardRules(readFileSync(plugin, "utf8"), readFileSync(rules, "utf8"))) problems.push(`ProGuard rule missing from the generated project: ${r}`);
  }
  const min = minTargetSdk(readFileSync(join(ROOT, ".github", "workflows", "android.yml"), "utf8"));
  const toml = join(appDir, "node_modules", "react-native", "gradle", "libs.versions.toml");
  const target = existsSync(toml) ? targetSdk(readFileSync(toml, "utf8")) : null;
  console.log(`targetSdkVersion: ${target ?? "unknown"} (Google Play minimum: ${min ?? "unknown"})`);
  if (target && min && target < min) problems.push(`targetSdkVersion ${target} is below Google Play's minimum ${min}: run /maintain-apps`);
  rmSync(join(appDir, "android"), { recursive: true, force: true }); // generated; CI makes its own
  return problems;
}

function checkIos(appDir) {
  if (!prebuild(appDir, "ios")) return ["expo prebuild --platform ios failed (see above)"];
  const problems = [];
  const iosDir = join(appDir, "ios");
  for (const name of readdirSync(iosDir)) {
    const plist = join(iosDir, name, "Info.plist");
    if (existsSync(plist)) for (const k of emptyUsageTexts(readFileSync(plist, "utf8"))) problems.push(`${name}/Info.plist: ${k} has no explanation text`);
  }
  rmSync(iosDir, { recursive: true, force: true });
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const appArg = args.find((a) => !a.startsWith("--"));
  if (!appArg) {
    console.error("Usage: node scripts/preflight.mjs apps/<slug> [--pro-preview] [--no-walkthrough]");
    process.exit(2);
  }
  const appDir = resolve(appArg);
  const slug = basename(appDir);
  const opts = { proPreview: args.includes("--pro-preview"), walkthrough: !args.includes("--no-walkthrough") };
  const results = [];
  const step = (name, fn) => {
    console.log(`\n=== ${name}`);
    let problems;
    try {
      const r = fn();
      problems = r === true ? [] : r === false ? ["failed (see above)"] : r;
    } catch (e) {
      problems = [String(e.message ?? e)];
    }
    for (const p of problems) console.log(`  ✗ ${p}`);
    results.push({ name, problems });
  };
  for (const name of planSteps(appDir, opts)) {
    step(name, () => {
      switch (name) {
        case "app name":
          if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return ["app folder must be lowercase letters, digits and dashes"];
          return existsSync(join(appDir, "package.json")) ? [] : [`${appArg}/package.json not found`];
        case "maestro flows":
          return run("node", [join(ROOT, "scripts", "check-maestro.mjs"), appDir], ROOT);
        case "lockfile": // npm ci fails when package.json and package-lock.json disagree
          return run("npm", ["ls", "--depth=0"], appDir);
        case "type check":
          return run("npx", ["tsc", "--noEmit"], appDir);
        case "unit tests":
          return run("npx", ["jest", "--ci"], appDir);
        case "lint":
          return run("npx", ["expo", "lint", "--", "--quiet"], appDir, { EXPO_OFFLINE: "1" });
        case "android project":
          return checkAndroid(appDir);
        case "ios project":
          return checkIos(appDir);
        case "walkthrough large":
          return run("node", ["e2e-web/walkthrough.mjs"], appDir);
        case "walkthrough small":
          return run("node", ["e2e-web/walkthrough.mjs", "--small", "--no-build"], appDir);
        case "walkthrough pro preview":
          return run("node", ["e2e-web/walkthrough.mjs", "--small"], appDir, { EXPO_PUBLIC_PRO_PREVIEW: "1" });
      }
      return [];
    });
  }
  console.log("\n=== Pre-flight summary");
  for (const r of results) console.log(`${r.problems.length ? "FAIL" : "PASS"}  ${r.name}${r.problems.length ? `: ${r.problems.join("; ")}` : ""}`);
  console.log("GitHub only: the native compile (Gradle/R8, Xcode) and the real emulator and simulator.");
  const failed = results.filter((r) => r.problems.length).length;
  console.log(failed ? `PRE-FLIGHT FAILED (${failed} step(s)): fix these before any GitHub run.` : "PRE-FLIGHT PASSED: ready for a GitHub run.");
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
