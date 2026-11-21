#!/usr/bin/env node
// Lists every app in apps/ with its version, Expo SDK and last release, and
// flags apps whose Expo SDK is falling behind. Each Expo SDK targets a recent
// Android API level and iOS SDK; Google Play requires apps to target a recent
// API level every year, and Apple raises its minimum Xcode/iOS SDK every
// spring, so old SDKs eventually block updates or hide an app.
//
//   node scripts/app-status.mjs              # asks npm for the latest Expo version (free)
//   node scripts/app-status.mjs --latest 58  # offline

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

// "~58.0.26", "^57.0.0", "58.0.0-preview.1" -> 58
export function sdkMajor(range) {
  const m = /(\d+)\.\d+/.exec(range ?? "");
  return m ? Number(m[1]) : null;
}

// Latest "## <version> ... <YYYY-MM-DD>" style entry in RELEASES.md, if any.
export function lastRelease(text) {
  const dates = [...(text ?? "").matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)].map((m) => m[1]).sort();
  return dates.at(-1) ?? null;
}

// ok: on the latest SDK; soon: one behind (upgrade at the next update);
// due: two or more behind (store requirements are likely to bite).
export function status(appSdk, latestSdk) {
  if (appSdk == null || latestSdk == null) return "unknown";
  const behind = latestSdk - appSdk;
  return behind <= 0 ? "ok" : behind === 1 ? "soon" : "due";
}

export function readApps(appsDir, latestSdk) {
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(appsDir, d.name, "package.json")))
    .map((d) => {
      const dir = join(appsDir, d.name);
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const expo = existsSync(join(dir, "app.json")) ? JSON.parse(readFileSync(join(dir, "app.json"), "utf8")).expo ?? {} : {};
      const releases = existsSync(join(dir, "RELEASES.md")) ? readFileSync(join(dir, "RELEASES.md"), "utf8") : "";
      const sdk = sdkMajor(pkg.dependencies?.expo);
      return {
        slug: d.name,
        name: expo.name ?? d.name,
        version: expo.version ?? "?",
        sdk,
        lastRelease: lastRelease(releases),
        status: status(sdk, latestSdk),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function latestFromNpm() {
  try {
    return sdkMajor(execFileSync("npm", ["view", "expo", "version"], { encoding: "utf8", shell: process.platform === "win32" }).trim());
  } catch {
    return null;
  }
}

function main(argv) {
  const { values } = parseArgs({ args: argv, options: { latest: { type: "string" }, apps: { type: "string", default: "apps" } } });
  const latest = values.latest ? Number(values.latest) : latestFromNpm();
  const apps = readApps(values.apps, latest);
  console.log(`Latest Expo SDK: ${latest ?? "unknown (offline? pass --latest <major>)"}\n`);
  if (!apps.length) {
    console.log("No apps yet.");
    return 0;
  }
  const rows = [["APP", "VERSION", "SDK", "LAST RELEASE", "STATUS"], ...apps.map((a) => [a.slug, a.version, a.sdk ?? "?", a.lastRelease ?? "never", a.status])];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(widths[i])).join("  "));
  const due = apps.filter((a) => a.status === "due").length;
  const soon = apps.filter((a) => a.status === "soon").length;
  console.log(`\n${due} due for an SDK upgrade, ${soon} one SDK behind.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
