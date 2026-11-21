import { test } from "node:test";
import assert from "node:assert/strict";
import { checkListing, parseSections, length, LIMITS } from "../scripts/check-listing.mjs";

const good = `# Store listing

## App Store name
Shift Habits

## App Store subtitle
Habits that fit any rota

## App Store keywords
habit,shift work,nurse,rota,routine,streak

## App Store promotional text
Build habits around nights, earlies and lates.

## App Store description
Shift Habits plans habits around your rota.

## Google Play title
Shift Habits: rota habits

## Google Play short description
Habit tracker built for rotating shifts and night work.

## Google Play full description
Shift Habits plans habits around your rota.

## Category
Health & Fitness
`;

test("a valid listing passes every field", () => {
  const r = checkListing(good);
  assert.equal(r.length, Object.keys(LIMITS).length);
  assert.ok(r.every((x) => x.ok), JSON.stringify(r.filter((x) => !x.ok)));
});

test("flags over-length, missing, placeholder, duplicate and banned text", () => {
  const bad = good
    .replace("Shift Habits\n\n## App Store subtitle", "A".repeat(31) + "\n\n## App Store subtitle")
    .replace("habit,shift work,nurse", "habit,Habit,nurse")
    .replace("Build habits around", "TODO build habits around")
    .replace(/## Google Play title\n.*\n/, "")
    .replace("Habit tracker built", "Like Habitica, a habit tracker built");
  const byField = Object.fromEntries(checkListing(bad, ["Habitica"]).map((x) => [x.field, x]));
  assert.match(byField["App Store name"].detail, /31\/30/);
  assert.match(byField["App Store keywords"].detail, /duplicate keywords: habit/);
  assert.match(byField["App Store promotional text"].detail, /placeholder/);
  assert.equal(byField["Google Play title"].detail, "missing");
  assert.match(byField["Google Play short description"].detail, /mentions Habitica/);
});

test("counts emoji as one character and keeps multi-line sections", () => {
  assert.equal(length("🙂ab"), 3);
  assert.equal(parseSections("## A\nline 1\n\nline 2\n## B\nx")["A"], "line 1\n\nline 2");
});

test("release notes are optional but limited when present", () => {
  assert.ok(!checkListing(good).some((r) => r.field === "Release notes"));
  const withNotes = good + "\n## Release notes\n" + "x".repeat(501) + "\n";
  const r = checkListing(withNotes).find((x) => x.field === "Release notes");
  assert.equal(r.ok, false);
  assert.match(r.detail, /501\/500/);
  assert.ok(checkListing(good + "\n## Release notes\nFixed the streak counter.\n").every((x) => x.ok));
});
