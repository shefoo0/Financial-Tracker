// Web walkthrough: drives the Money Planner web build like a real user (Playwright + Chromium, iPhone size).
// Usage: node e2e-web/walkthrough.mjs [--no-build]   (from apps/moneyplanner; the web build keeps data in memory)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { Driver } from './driver.mjs';
import { build, patchAlert, serve } from './lib.mjs';
import { sections } from './sections.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(here);
const outDir = join(here, '.web-build');
const shotDir = join(here, 'shots');
const noBuild = process.argv.includes('--no-build');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

if (!noBuild) build(appDir, outDir);
await patchAlert(outDir);
await rm(shotDir, { recursive: true, force: true });
await mkdir(shotDir, { recursive: true });
const { server, url } = await serve(outDir);
const d = new Driver();
await d.open(url, shotDir);

const report = [];
let seenProblems = 0;
for (const [name, fn] of sections) {
  if (only && !name.startsWith(only) && !name.startsWith('1 ')) continue; // --only=10 runs the wizard first, then that section
  console.log(`\n=== ${name}`);
  const rec = { name, steps: [], ok: true };
  report.push(rec);
  let aborted = false;
  const step = async (label, f, opts = {}) => {
    if (aborted) { console.log(`  SKIP ${label}`); rec.steps.push({ label, ok: null }); return; }
    d.current = `${name} > ${label}`;
    try {
      await f();
      const fresh = d.problems.slice(seenProblems);
      seenProblems = d.problems.length;
      if (fresh.length) { throw new Error(`browser errors: ${fresh.map((p) => `${p.kind}: ${p.text}`).join(' || ')}`); }
      console.log(`  PASS ${label}`);
      rec.steps.push({ label, ok: true });
    } catch (e) {
      seenProblems = d.problems.length;
      rec.ok = false; if (!opts.soft) aborted = true;
      console.log(`  FAIL${opts.soft ? ' (soft, continuing)' : ''} ${label}\n       ${String(e.message).split('\n')[0].slice(0, 700)}`);
      rec.steps.push({ label, ok: false, error: e.message });
      await d.shot(`FAIL-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`).catch(() => {});
      if (!opts.soft) await d.dump(label).catch(() => {});
    }
  };
  try { await d.recover(); await fn(d, step); } catch (e) { rec.ok = false; console.log(`  SECTION ERROR ${e.message}`); }
}

await d.close();
server.close();
console.log('\n===== SUMMARY');
for (const r of report) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.steps.filter((s) => s.ok).length}/${r.steps.length} steps)`);
if (d.problems.length) {
  console.log(`\nBrowser errors collected (${d.problems.length}):`);
  for (const p of d.problems) console.log(` - [${p.at}] ${p.kind}: ${p.text}`);
}
const allSteps = report.flatMap((r) => r.steps);
const passed = report.length > 0 && allSteps.every((s) => s.ok === true) && report.every((r) => r.ok) && d.problems.length === 0;
console.log(passed ? '\nWALKTHROUGH PASSED' : `\nWALKTHROUGH FAILED (${allSteps.filter((s) => s.ok !== true).length} failed or skipped step(s), ${d.problems.length} browser error(s))`);
process.exit(passed ? 0 : 1);
