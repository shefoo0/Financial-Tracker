#!/usr/bin/env node
// Renders an HTML file to a PNG at an exact pixel size, for store graphics:
// Google Play's 1024x500 feature graphic and 512x512 icon, for example.
// Free and local (Playwright's Chromium).
//
//   node scripts/render-graphic.mjs apps/<slug>/store/graphics/feature-graphic.html apps/<slug>/store/graphics/feature-graphic.png --size 1024x500
//
// Relative image paths in the HTML resolve from the HTML file's folder.

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function parseSize(value) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(value ?? "");
  if (!m) throw new Error(`--size must look like 1024x500 (got "${value}")`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export async function render(htmlFile, outFile, { width, height }) {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)("playwright"));
  } catch {
    throw new Error("Playwright isn't installed. Run: npm install && npx playwright install chromium");
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(resolve(htmlFile)).href, { waitUntil: "networkidle" });
    mkdirSync(dirname(resolve(outFile)), { recursive: true });
    // No alpha channel: the stores reject or flatten transparent graphics.
    await page.screenshot({ path: outFile, omitBackground: false, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { size: { type: "string" } } });
  const [html, out] = positionals;
  if (!html || !out || !values.size) {
    console.error("Usage: node scripts/render-graphic.mjs <in.html> <out.png> --size 1024x500");
    process.exit(2);
  }
  render(html, out, parseSize(values.size)).then(
    () => console.log(`${out} (${values.size})`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
