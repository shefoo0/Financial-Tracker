#!/usr/bin/env node
// Turns each app's store/privacy-policy.md and store/support.md into web pages
// under docs/, ready for GitHub Pages (free). Both stores require a public
// privacy policy URL, and the App Store also requires a support URL.
//
//   node scripts/publish-pages.mjs            # every app in apps/
//   node scripts/publish-pages.mjs <slug>     # one app
//
// Then push, and turn on Pages once: repository Settings -> Pages ->
// "Deploy from a branch" -> your branch, folder /docs. The URLs are
// https://<github-user>.github.io/<repo>/privacy/<slug>/ and .../support/<slug>/

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^_\s][^_]*)_/g, "$1<em>$2</em>");
  // Links: only web and email addresses, so a policy can't carry script URLs.
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

// A small Markdown subset: headings, paragraphs, lists, rules, bold, italic,
// code and links. Enough for a privacy policy, with no dependencies.
export function markdownToHtml(md) {
  const out = [];
  let para = [];
  let list = null; // "ul" | "ol"
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushPara();
      closeList();
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushPara();
      closeList();
      out.push("<hr>");
    } else if ((m = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(line))) {
      flushPara();
      const kind = m[1] ? "ol" : "ul";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(m[2])}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}

export function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: #1d1d1f; --bg: #ffffff; --muted: #6e6e73; --link: #0066cc; }
  @media (prefers-color-scheme: dark) { :root { --fg: #f5f5f7; --bg: #111113; --muted: #a1a1a6; --link: #4da3ff; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.9em; line-height: 1.2; } h2 { margin-top: 2em; }
  a { color: var(--link); } code { font-size: 0.9em; } hr { border: 0; border-top: 1px solid var(--muted); }
  footer { margin-top: 48px; color: var(--muted); font-size: 0.85em; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function appName(appDir, slug) {
  try {
    return JSON.parse(readFileSync(join(appDir, "app.json"), "utf8")).expo?.name || slug;
  } catch {
    return slug;
  }
}

// Each app gets one page per store document. The privacy policy is required.
export const PAGES = [
  { file: "privacy-policy.md", dir: "privacy", title: "Privacy Policy", required: true },
  { file: "support.md", dir: "support", title: "Support", required: false },
];

export function publish({ appsDir = "apps", docsDir = "docs", only } = {}) {
  const slugs = (only ? [only] : readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)).sort();
  const published = [];
  for (const slug of slugs) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Bad app folder name "${slug}" (use lowercase letters, digits and dashes)`);
    const name = appName(join(appsDir, slug), slug);
    for (const pg of PAGES) {
      const src = join(appsDir, slug, "store", pg.file);
      if (!existsSync(src)) {
        if (only && pg.required) throw new Error(`${src} not found`);
        continue;
      }
      const outDir = join(docsDir, pg.dir, slug);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "index.html"), page(`${name} - ${pg.title}`, markdownToHtml(readFileSync(src, "utf8"))));
      published.push({ slug, name, page: pg.dir, path: `${pg.dir}/${slug}/` });
    }
  }
  // Index of every published page (re-scan so one-app runs keep the others listed).
  const rows = new Map();
  for (const pg of PAGES) {
    const dir = join(docsDir, pg.dir);
    if (!existsSync(dir)) continue;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (!rows.has(d.name)) rows.set(d.name, []);
      rows.get(d.name).push(`<a href="${pg.dir}/${d.name}/">${pg.title}</a>`);
    }
  }
  const items = [...rows.keys()].sort().map((s) => `<li><strong>${escapeHtml(appName(join(appsDir, s), s))}</strong>: ${rows.get(s).join(" · ")}</li>`).join("\n");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, "index.html"), page("Apps", `<h1>Apps</h1>\n<ul>\n${items}\n</ul>`));
  writeFileSync(join(docsDir, ".nojekyll"), "");
  return published;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const published = publish({ only: process.argv[2] });
    if (!published.length) console.log("No apps/<slug>/store/privacy-policy.md or support.md files found.");
    for (const p of published) console.log(`docs/${p.path}index.html  (${p.name})`);
    if (published.length) console.log("\nPush, then turn on GitHub Pages (Settings -> Pages -> branch, folder /docs).\nURLs: https://<github-user>.github.io/<repo>/<privacy|support>/<slug>/");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
