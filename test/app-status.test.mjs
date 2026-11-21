import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { lastRelease, readApps, sdkMajor, status } from "../scripts/app-status.mjs";

test("reads the SDK major from a version range", () => {
  assert.equal(sdkMajor("~58.0.26"), 58);
  assert.equal(sdkMajor("^57.1.0"), 57);
  assert.equal(sdkMajor("58.0.0-preview.1"), 58);
  assert.equal(sdkMajor(undefined), null);
  assert.equal(sdkMajor("latest"), null);
});

test("status by how far behind", () => {
  assert.equal(status(58, 58), "ok");
  assert.equal(status(57, 58), "soon");
  assert.equal(status(55, 58), "due");
  assert.equal(status(null, 58), "unknown");
  assert.equal(status(58, null), "unknown");
});

test("finds the latest release date", () => {
  assert.equal(lastRelease("## 1.0.0 - 2026-03-02\n## 1.1.0 - 2026-09-14\nbuilt 2026-09-10"), "2026-09-14");
  assert.equal(lastRelease(""), null);
});

function fixture() {
  const apps = mkdtempSync(join(tmpdir(), "apps-"));
  const add = (slug, expo, version, releases) => {
    mkdirSync(join(apps, slug));
    writeFileSync(join(apps, slug, "package.json"), JSON.stringify({ dependencies: { expo } }));
    writeFileSync(join(apps, slug, "app.json"), JSON.stringify({ expo: { name: slug.toUpperCase(), version } }));
    if (releases) writeFileSync(join(apps, slug, "RELEASES.md"), releases);
  };
  add("tides", "~58.0.2", "1.2.0", "## 1.2.0 - 2026-10-01");
  add("habits", "~55.0.0", "2.0.1");
  mkdirSync(join(apps, "not-an-app"));
  return apps;
}

test("lists apps with their status", () => {
  const apps = readApps(fixture(), 58);
  assert.deepEqual(apps.map((a) => [a.slug, a.version, a.sdk, a.lastRelease, a.status]), [
    ["habits", "2.0.1", 55, null, "due"],
    ["tides", "1.2.0", 58, "2026-10-01", "ok"],
  ]);
  assert.deepEqual(readApps(join(tmpdir(), "does-not-exist-xyz"), 58), []);
});

test("CLI prints a table", () => {
  const out = execFileSync("node", ["scripts/app-status.mjs", "--latest", "58", "--apps", fixture()], { encoding: "utf8" });
  assert.match(out, /habits\s+2\.0\.1\s+55\s+never\s+due/);
  assert.match(out, /1 due for an SDK upgrade, 0 one SDK behind\./);
});
