#!/usr/bin/env node
// Checks a store/listing.md file against App Store and Google Play text limits.
// Runs locally and offline; costs nothing.
//
//   node scripts/check-listing.mjs apps/<slug>/store/listing.md [--banned "Brand A,Brand B"]
//
// The listing uses one "## <Field>" heading per field; see LIMITS below for the names.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LIMITS = {
  "App Store name": 30,
  "App Store subtitle": 30,
  "App Store keywords": 100,
  "App Store promotional text": 170,
  "App Store description": 4000,
  "Google Play title": 30,
  "Google Play short description": 80,
  "Google Play full description": 4000,
};

// Checked only when present. Release notes are the App Store's "What's New"
// and Google Play's "Release notes"; Play's 500-character limit is the lower.
export const OPTIONAL_LIMITS = {
  "Release notes": 500,
};

const PLACEHOLDER = /\b(lorem ipsum|todo|tbd|fixme|placeholder|coming soon)\b|\[[^\]]*(insert|your app)[^\]]*\]/i;

// Characters as the stores count them (code points, so an emoji is one).
export const length = (s) => [...s].length;

export function parseSections(markdown) {
  const sections = {};
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1];
      sections[current] = [];
    } else if (/^#\s/.test(line)) {
      current = null;
    } else if (current) {
      sections[current].push(line);
    }
  }
  return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join("\n").trim()]));
}

export function checkListing(markdown, banned = []) {
  const sections = parseSections(markdown);
  const results = [];
  const fields = [...Object.entries(LIMITS), ...Object.entries(OPTIONAL_LIMITS).filter(([f]) => sections[f] !== undefined)];
  for (const [field, max] of fields) {
    const text = sections[field];
    if (text === undefined || text === "") {
      results.push({ field, ok: false, detail: "missing" });
      continue;
    }
    const problems = [];
    const n = length(text);
    if (n > max) problems.push(`${n}/${max} characters`);
    if (PLACEHOLDER.test(text)) problems.push("contains placeholder text");
    const hits = banned.filter((b) => b && text.toLowerCase().includes(b.toLowerCase()));
    if (hits.length) problems.push(`mentions ${hits.join(", ")}`);
    if (field === "App Store keywords") {
      const words = text.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
      const dupes = words.filter((w, i) => words.indexOf(w) !== i);
      if (dupes.length) problems.push(`duplicate keywords: ${[...new Set(dupes)].join(", ")}`);
    }
    results.push({ field, ok: problems.length === 0, detail: problems.length ? problems.join("; ") : `${n}/${max}` });
  }
  return results;
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith("--"));
  const bi = argv.indexOf("--banned");
  const banned = bi >= 0 && argv[bi + 1] ? argv[bi + 1].split(",").map((s) => s.trim()) : [];
  if (!file) {
    console.error('Usage: node scripts/check-listing.mjs <listing.md> [--banned "Brand A,Brand B"]');
    return 2;
  }
  const results = checkListing(readFileSync(file, "utf8"), banned);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.field}: ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} field(s) failed.` : "\nAll fields pass.");
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
