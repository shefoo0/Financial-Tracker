import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { safeRelativePath } from "../src/paths.ts";

test("keeps nested relative paths", () => {
  assert.equal(safeRelativePath("store/listing.md"), join("store", "listing.md"));
  assert.equal(safeRelativePath("/mnt/session/outputs/REPORT.md"), "REPORT.md");
  assert.equal(safeRelativePath("/abs/x.txt"), join("abs", "x.txt"));
});

test("refuses paths that escape the output directory", () => {
  assert.match(safeRelativePath("../../etc/passwd"), /^file-\d+$/);
  assert.match(safeRelativePath("a/../../b"), /^file-\d+$/);
  assert.match(safeRelativePath(""), /^file-\d+$/);
});
