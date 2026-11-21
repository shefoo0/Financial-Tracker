import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCli, usdToCents, UsageError } from "../src/args.ts";

test("parses idea and defaults", () => {
  const o = parseCli(["Offline", "habit", "tracker"]);
  assert.equal(o.idea, "Offline habit tracker");
  assert.equal(o.budgetUsd, 20);
  assert.equal(o.maxIterations, 4);
  assert.equal(o.outDir, "output");
  assert.equal(o.bundleId, undefined);
});

test("parses options", () => {
  const o = parseCli(["Idea", "--bundle-id", "com.me.app", "--budget", "7.5", "--max-iterations", "2", "--monetization", "free"]);
  assert.equal(o.bundleId, "com.me.app");
  assert.equal(o.budgetUsd, 7.5);
  assert.equal(o.maxIterations, 2);
  assert.equal(o.monetization, "free");
});

test("rejects bad input", () => {
  assert.throws(() => parseCli([]), UsageError);
  assert.throws(() => parseCli(["x", "--bundle-id", "notreverse"]), UsageError);
  assert.throws(() => parseCli(["x", "--bundle-id", "com.1bad"]), UsageError);
  assert.throws(() => parseCli(["x", "--budget", "0.5"]), UsageError);
  assert.throws(() => parseCli(["x", "--budget", "abc"]), UsageError);
  assert.throws(() => parseCli(["x", "--max-iterations", "21"]), UsageError);
  assert.throws(() => parseCli(["x", "--max-iterations", "1.5"]), UsageError);
});

test("converts dollars to integer cents", () => {
  assert.equal(usdToCents(20), "2000");
  assert.equal(usdToCents(7.5), "750");
  assert.equal(usdToCents(0.1 + 0.2), "30");
});
