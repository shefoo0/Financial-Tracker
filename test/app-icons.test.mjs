// Every app's Android adaptive-icon foreground and monochrome layers must have an alpha channel. An opaque
// foreground covers the icon background: the launcher shows a plain square (it happened to Money Planner).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APPS = join(ROOT, "apps");

/** PNG colour type (IHDR byte 25): 4 = grey + alpha, 6 = RGBA; 2 = RGB and 0 = grey have no alpha. */
export function pngHasAlpha(buf) {
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") throw new Error("not a PNG");
  return buf[25] === 4 || buf[25] === 6 || buf.includes(Buffer.from("tRNS"));
}

test("pngHasAlpha reads the colour type", () => {
  const head = (type) => Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(17), Buffer.from([type]), Buffer.alloc(8)]);
  assert.equal(pngHasAlpha(head(6)), true);
  assert.equal(pngHasAlpha(head(2)), false);
});

const apps = existsSync(APPS) ? readdirSync(APPS).filter((a) => existsSync(join(APPS, a, "app.json"))) : [];
for (const app of apps) {
  test(`${app}: Android adaptive-icon foreground and monochrome layers are transparent`, () => {
    const icon = JSON.parse(readFileSync(join(APPS, app, "app.json"), "utf8")).expo?.android?.adaptiveIcon ?? {};
    for (const key of ["foregroundImage", "monochromeImage"]) {
      if (!icon[key]) continue;
      const file = join(APPS, app, icon[key]);
      assert.ok(pngHasAlpha(readFileSync(file)), `${app} ${key} (${icon[key]}) has no alpha channel: re-render it with render-graphic.mjs --transparent`);
    }
  });
}
