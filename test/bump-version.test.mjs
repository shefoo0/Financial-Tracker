import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { bump, nextVersion } from "../scripts/bump-version.mjs";

test("semver bumps", () => {
  assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  assert.equal(nextVersion("1.2.3", "build"), "1.2.3");
  assert.throws(() => nextVersion("1.2", "patch"), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => nextVersion("1.2.3", "huge"), /Unknown bump/);
});

test("raises both build numbers, creating them when missing", () => {
  const a = { expo: { version: "1.0.0", ios: { bundleIdentifier: "com.x.y" }, android: { package: "com.x.y" } } };
  const r = bump(a, "minor");
  assert.deepEqual(r.after, { version: "1.1.0", buildNumber: "1", versionCode: 1 });
  assert.equal(a.expo.ios.bundleIdentifier, "com.x.y");
  const b = { expo: { version: "1.1.0", ios: { buildNumber: "7" }, android: { versionCode: 7 } } };
  assert.deepEqual(bump(b, "build").after, { version: "1.1.0", buildNumber: "8", versionCode: 8 });
});

test("rejects bad build numbers", () => {
  assert.throws(() => bump({ expo: { version: "1.0.0", ios: { buildNumber: "abc" } } }, "patch"), /whole number/);
  assert.throws(() => bump({}, "patch"), /no "expo"/);
});

test("CLI rewrites app.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "bump-"));
  writeFileSync(join(dir, "app.json"), JSON.stringify({ expo: { version: "2.0.9", ios: { buildNumber: "3" }, android: { versionCode: 3 } } }));
  const out = execFileSync("node", ["scripts/bump-version.mjs", dir, "patch"], { encoding: "utf8" });
  assert.match(out, /2\.0\.9 -> 2\.0\.10/);
  const expo = JSON.parse(readFileSync(join(dir, "app.json"), "utf8")).expo;
  assert.equal(expo.version, "2.0.10");
  assert.equal(expo.ios.buildNumber, "4");
  assert.equal(expo.android.versionCode, 4);
});
