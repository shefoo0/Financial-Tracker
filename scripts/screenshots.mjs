#!/usr/bin/env node
// Takes store screenshots of an Expo app from its web build, at the sizes the
// App Store and Google Play accept. Free and local: Expo's web export plus
// Playwright's Chromium.
//
//   node scripts/screenshots.mjs apps/<slug> --routes "/,/stats,/settings" [--dark] [--devices iphone-6.9,android-phone]
//
// One-time setup:  npm install && npx playwright install chromium
// The app needs web support:  cd apps/<slug> && npx expo install react-dom react-native-web @expo/metro-runtime
//
// Screenshots go to apps/<slug>/store/screenshots/<device>/NN-<route>.png.
// They show the web rendering; native-only features (maps, camera, widgets)
// won't appear, so check every image before you upload it.

import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

// CSS viewport x device scale factor = the pixel size each store accepts.
export const DEVICES = {
  "iphone-6.9": { width: 440, height: 956, scale: 3, label: "iPhone 6.9-inch, 1320x2868 (App Store)" },
  "ipad-13": { width: 1032, height: 1376, scale: 2, label: "iPad 13-inch, 2064x2752 (App Store, only if the app supports iPad)" },
  "android-phone": { width: 360, height: 640, scale: 3, label: "Android phone, 1080x1920 (Google Play)" },
  "android-tablet": { width: 800, height: 1280, scale: 2, label: "Android 10-inch tablet, 1600x2560 (Google Play, optional)" },
};
export const DEFAULT_DEVICES = ["iphone-6.9", "android-phone"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };

export function parseRoutes(value) {
  const routes = (value ?? "/").split(",").map((r) => r.trim()).filter(Boolean).map((r) => (r.startsWith("/") ? r : `/${r}`));
  if (!routes.length) throw new Error("--routes is empty");
  return routes;
}

export function parseDevices(value) {
  const names = value ? value.split(",").map((d) => d.trim()).filter(Boolean) : DEFAULT_DEVICES;
  for (const n of names) if (!DEVICES[n]) throw new Error(`Unknown device "${n}" (use ${Object.keys(DEVICES).join(", ")})`);
  return names;
}

export function fileNameFor(index, route) {
  const name = route.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "home";
  return `${String(index + 1).padStart(2, "0")}-${name}.png`;
}

// Maps a URL path to a file in the web build: the file itself, <path>.html,
// <path>/index.html, or index.html for client-side routes. Never leaves root.
export function resolveFile(root, urlPath) {
  const base = resolve(root);
  let p;
  try {
    p = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return join(base, "index.html");
  }
  for (const candidate of [p, `${p}.html`, join(p, "index.html")]) {
    const full = resolve(base, `.${sep}${candidate}`);
    if (full !== base && !full.startsWith(base + sep)) return null;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return join(base, "index.html");
}

// Expo's "server" web output renders pages on a server, so its export has no
// HTML to serve. For screenshots, export as a single-page app instead.
export function withSinglePageOutput(appJsonText) {
  const json = JSON.parse(appJsonText);
  const web = json.expo?.web;
  if (!web || web.output !== "server") return null;
  web.output = "single";
  return JSON.stringify(json, null, 2) + "\n";
}

// The folder holding index.html: the export root, or client/ for older layouts.
export function webRoot(distDir) {
  for (const dir of [distDir, join(distDir, "client")]) if (existsSync(join(dir, "index.html"))) return dir;
  return null;
}

export function exportWeb(appDir) {
  const appJsonPath = join(appDir, "app.json");
  const original = existsSync(appJsonPath) ? readFileSync(appJsonPath, "utf8") : null;
  const patched = original && withSinglePageOutput(original);
  if (patched) writeFileSync(appJsonPath, patched);
  try {
    return spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", "dist-web", "--clear"], { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" });
  } finally {
    if (patched) writeFileSync(appJsonPath, original); // always put app.json back
  }
}

export function serve(root) {
  const server = createServer((req, res) => {
    const file = resolveFile(root, req.url ?? "/");
    if (!file || !existsSync(file)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

export async function capture({ distDir, outDir, routes, devices, dark = false }) {
  const require = createRequire(import.meta.url);
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    throw new Error("Playwright isn't installed. Run: npm install && npx playwright install chromium");
  }
  const server = await serve(distDir);
  const { port } = server.address();
  const browser = await chromium.launch();
  const saved = [];
  try {
    for (const name of devices) {
      const d = DEVICES[name];
      const context = await browser.newContext({
        viewport: { width: d.width, height: d.height },
        deviceScaleFactor: d.scale,
        isMobile: true,
        hasTouch: true,
        colorScheme: dark ? "dark" : "light",
      });
      const page = await context.newPage();
      mkdirSync(join(outDir, name), { recursive: true });
      for (const [i, route] of routes.entries()) {
        await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500); // let fonts and animations settle
        const file = join(outDir, name, fileNameFor(i, route));
        await page.screenshot({ path: file });
        saved.push(file);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return saved;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      routes: { type: "string" },
      devices: { type: "string" },
      dark: { type: "boolean", default: false },
      dist: { type: "string" },
    },
  });
  const appDir = positionals[0];
  if (!appDir) {
    console.error('Usage: node scripts/screenshots.mjs apps/<slug> --routes "/,/stats" [--dark] [--devices iphone-6.9,android-phone] [--dist <built web dir>]');
    return 2;
  }
  const routes = parseRoutes(values.routes);
  const devices = parseDevices(values.devices);
  let distDir = values.dist;
  if (!distDir) {
    distDir = join(appDir, "dist-web");
    console.log("Building the web version (npx expo export --platform web)...");
    const r = exportWeb(appDir);
    if (r.status !== 0) {
      console.error("\nWeb export failed. If web support is missing, run in the app folder:\n  npx expo install react-dom react-native-web @expo/metro-runtime");
      return 1;
    }
  }
  const root = webRoot(distDir);
  if (!root) {
    console.error(`No index.html in ${distDir}. If the app uses app.config.js with web.output "server", set it to "single" or "static" for screenshots.`);
    return 1;
  }
  const outDir = join(appDir, "store", "screenshots", values.dark ? "dark" : "light");
  const saved = await capture({ distDir: root, outDir, routes, devices, dark: values.dark });
  for (const name of devices) console.log(`${DEVICES[name].label}: ${outDir}/${name}/`);
  console.log(`\n${saved.length} screenshot(s). Check each one before uploading: web rendering can differ from the native app.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
