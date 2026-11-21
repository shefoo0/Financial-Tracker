import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { parseSize, render } from "../scripts/render-graphic.mjs";

test("parses sizes", () => {
  assert.deepEqual(parseSize("1024x500"), { width: 1024, height: 500 });
  assert.throws(() => parseSize("1024*500"), /--size/);
  assert.throws(() => parseSize(undefined), /--size/);
});

let hasPlaywright = true;
try { createRequire(import.meta.url)("playwright"); } catch { hasPlaywright = false; }

test("renders an opaque PNG at the exact size", { skip: !hasPlaywright && "Playwright not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "gfx-"));
  writeFileSync(join(dir, "g.html"), `<body style="margin:0;background:#0a7;width:1024px;height:500px"><h1>Hi</h1></body>`);
  await render(join(dir, "g.html"), join(dir, "out", "g.png"), { width: 1024, height: 500 });
  const png = readFileSync(join(dir, "out", "g.png"));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 500]);
  assert.equal(png[25], 2, "colour type 2 = RGB, no alpha channel");
});
