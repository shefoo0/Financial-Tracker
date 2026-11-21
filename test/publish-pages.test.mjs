import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markdownToHtml, publish } from "../scripts/publish-pages.mjs";

test("converts the markdown a policy uses", () => {
  const html = markdownToHtml(`# Privacy Policy\n\nWe store **nothing** off\nyour device.\n\n## Data\n- Habits, kept *locally*\n- No \`analytics\`\n\n1. First\n2. Second\n\n---\nContact [us](mailto:a@b.co).`);
  assert.match(html, /<h1>Privacy Policy<\/h1>/);
  assert.match(html, /<p>We store <strong>nothing<\/strong> off your device\.<\/p>/);
  assert.match(html, /<ul>\n<li>Habits, kept <em>locally<\/em><\/li>\n<li>No <code>analytics<\/code><\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>First<\/li>\n<li>Second<\/li>\n<\/ol>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<a href="mailto:a@b.co">us<\/a>/);
});

test("escapes HTML and drops unsafe links", () => {
  const html = markdownToHtml(`<script>alert(1)</script> [x](javascript:alert(1))`);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript/);
});

test("publishes privacy and support pages and an index", () => {
  const root = mkdtempSync(join(tmpdir(), "pp-"));
  const apps = join(root, "apps"), docs = join(root, "docs");
  mkdirSync(join(apps, "tide-times", "store"), { recursive: true });
  writeFileSync(join(apps, "tide-times", "store", "privacy-policy.md"), "# Privacy\nNo data collected.");
  writeFileSync(join(apps, "tide-times", "store", "support.md"), "# Support\nEmail help@example.org.");
  writeFileSync(join(apps, "tide-times", "app.json"), JSON.stringify({ expo: { name: "Tide Times" } }));
  mkdirSync(join(apps, "no-policy-yet"), { recursive: true });

  const out = publish({ appsDir: apps, docsDir: docs });
  assert.deepEqual(out.map((p) => p.path), ["privacy/tide-times/", "support/tide-times/"]);
  const pageHtml = readFileSync(join(docs, "privacy", "tide-times", "index.html"), "utf8");
  assert.match(pageHtml, /<title>Tide Times - Privacy Policy<\/title>/);
  assert.match(pageHtml, /No data collected\./);
  assert.match(readFileSync(join(docs, "support", "tide-times", "index.html"), "utf8"), /<title>Tide Times - Support<\/title>/);
  const index = readFileSync(join(docs, "index.html"), "utf8");
  assert.match(index, /<strong>Tide Times<\/strong>: <a href="privacy\/tide-times\/">Privacy Policy<\/a> · <a href="support\/tide-times\/">Support<\/a>/);
  assert.ok(existsSync(join(docs, ".nojekyll")));
  assert.throws(() => publish({ appsDir: apps, docsDir: docs, only: "no-policy-yet" }), /not found/);
  assert.throws(() => publish({ appsDir: apps, docsDir: docs, only: "../etc" }), /Bad app folder/);
});
