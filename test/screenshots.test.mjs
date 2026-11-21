import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DEVICES, capture, fileNameFor, parseDevices, parseRoutes, resolveFile, webRoot, withSinglePageOutput } from "../scripts/screenshots.mjs";

test("device sizes match what the stores accept", () => {
  const px = (d) => [d.width * d.scale, d.height * d.scale];
  assert.deepEqual(px(DEVICES["iphone-6.9"]), [1320, 2868]);
  assert.deepEqual(px(DEVICES["ipad-13"]), [2064, 2752]);
  assert.deepEqual(px(DEVICES["android-phone"]), [1080, 1920]);
  assert.deepEqual(px(DEVICES["android-tablet"]), [1600, 2560]);
});

test("parses routes and devices", () => {
  assert.deepEqual(parseRoutes(undefined), ["/"]);
  assert.deepEqual(parseRoutes("/, stats ,/settings/"), ["/", "/stats", "/settings/"]);
  assert.deepEqual(parseDevices(undefined), ["iphone-6.9", "android-phone"]);
  assert.throws(() => parseDevices("iphone-6.9,pixel-99"), /Unknown device "pixel-99"/);
});

test("names files in order", () => {
  assert.equal(fileNameFor(0, "/"), "01-home.png");
  assert.equal(fileNameFor(1, "/settings/"), "02-settings.png");
  assert.equal(fileNameFor(11, "/habit/42?tab=Stats"), "12-habit-42.png");
});

test("serves build files, falls back to index.html, never leaves the root", () => {
  const root = mkdtempSync(join(tmpdir(), "web-"));
  writeFileSync(join(root, "index.html"), "home");
  writeFileSync(join(root, "stats.html"), "stats");
  mkdirSync(join(root, "settings"));
  writeFileSync(join(root, "settings", "index.html"), "settings");
  assert.equal(resolveFile(root, "/"), join(root, "index.html"));
  assert.equal(resolveFile(root, "/stats"), join(root, "stats.html"));
  assert.equal(resolveFile(root, "/settings"), join(root, "settings", "index.html"));
  assert.equal(resolveFile(root, "/habit/7"), join(root, "index.html"));
  assert.equal(resolveFile(root, "/../../etc/passwd"), null);
  assert.equal(resolveFile(root, "/%2e%2e/%2e%2e/etc/passwd"), null);
});

let hasPlaywright = true;
try { createRequire(import.meta.url)("playwright"); } catch { hasPlaywright = false; }

test("captures real screenshots at store sizes", { skip: !hasPlaywright && "Playwright not installed" }, async () => {
  const root = mkdtempSync(join(tmpdir(), "shots-"));
  const dist = join(root, "dist");
  mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), `<!doctype html><meta name=viewport content="width=device-width"><style>@media (prefers-color-scheme: dark){body{background:#000;color:#fff}}</style><h1 id=t></h1><script>t.textContent=location.pathname</script>`);
  const saved = await capture({ distDir: dist, outDir: join(root, "out"), routes: ["/", "/stats"], devices: ["iphone-6.9", "android-phone"], dark: true });
  assert.equal(saved.length, 4);
  const png = readFileSync(join(root, "out", "iphone-6.9", "02-stats.png"));
  assert.equal(png.readUInt32BE(16), 1320); // PNG width
  assert.equal(png.readUInt32BE(20), 2868); // PNG height
  const android = readFileSync(join(root, "out", "android-phone", "01-home.png"));
  assert.deepEqual([android.readUInt32BE(16), android.readUInt32BE(20)], [1080, 1920]);
});

test("switches server web output to a single-page export, leaves others alone", () => {
  const patched = JSON.parse(withSinglePageOutput(JSON.stringify({ expo: { name: "A", web: { output: "server", favicon: "f.png" } } })));
  assert.deepEqual(patched.expo.web, { output: "single", favicon: "f.png" });
  assert.equal(withSinglePageOutput(JSON.stringify({ expo: { web: { output: "static" } } })), null);
  assert.equal(withSinglePageOutput(JSON.stringify({ expo: {} })), null);
});

test("finds the folder that holds index.html", () => {
  const root = mkdtempSync(join(tmpdir(), "dist-"));
  assert.equal(webRoot(root), null);
  mkdirSync(join(root, "client"));
  writeFileSync(join(root, "client", "index.html"), "x");
  assert.equal(webRoot(root), join(root, "client"));
  writeFileSync(join(root, "index.html"), "x");
  assert.equal(webRoot(root), root);
});
