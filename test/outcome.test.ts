import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDescription, buildOutcomeEvent, STARTER_RUBRIC } from "../src/outcome.ts";

test("description includes the idea and the given bundle id", () => {
  const d = buildDescription({ idea: "Tide tables", bundleId: "com.me.tides", monetization: "free" });
  assert.match(d, /Tide tables/);
  assert.match(d, /com\.me\.tides/);
  assert.match(d, /Monetization: free/);
  assert.doesNotMatch(d, /com\.example/);
});

test("description falls back when bundle id and monetization are missing", () => {
  const d = buildDescription({ idea: "Tide tables" });
  assert.match(d, /com\.example\.<slug>/);
  assert.match(d, /justify it in spec\.md/);
});

test("outcome event shape", () => {
  const e = buildOutcomeEvent({ idea: "x", notes: "dark theme first" }, 3);
  assert.equal(e.type, "user.define_outcome");
  assert.equal(e.max_iterations, 3);
  assert.equal(e.rubric.content, STARTER_RUBRIC);
  assert.match(e.description, /dark theme first/);
});
