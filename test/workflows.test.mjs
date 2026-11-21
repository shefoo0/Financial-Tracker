import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";

// GitHub Actions workflows: parse them, keep them free and hand-started, keep
// inputs out of shell scripts (script injection), and syntax-check every
// shell step with bash -n.
const files = readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"));
const hasBash = spawnSync("bash", ["--version"]).status === 0;

for (const f of files) {
  const wf = parse(readFileSync(`.github/workflows/${f}`, "utf8"));

  test(`${f}: started by hand, read-only token, free runners`, () => {
    assert.deepEqual(Object.keys(wf.on), ["workflow_dispatch"], "only workflow_dispatch (no automatic runs that spend minutes)");
    assert.deepEqual(wf.permissions, { contents: "read" });
    assert.equal(wf.defaults?.run?.shell, "bash", "set defaults.run.shell: bash so pipeline failures fail the step");
    for (const [name, job] of Object.entries(wf.jobs)) {
      if (f === "ios-simulator.yml" && name === "test") {
        // The one exception: GitHub's free macOS machine for the iPhone simulator,
        // counted 10x on private repos, so it must stay short.
        assert.equal(job["runs-on"], "macos-latest");
        assert.ok(job["timeout-minutes"] <= 30, "macOS job: 30 minutes at most");
        continue;
      }
      assert.equal(job["runs-on"], "ubuntu-latest", `${name}: only free standard runners`);
      assert.ok(job["timeout-minutes"] <= 60, `${name}: needs a timeout of an hour or less`);
    }
  });

  test(`${f}: steps are well formed and scripts are safe`, () => {
    for (const job of Object.values(wf.jobs)) {
      for (const step of job.steps) {
        assert.ok(("uses" in step) !== ("run" in step), `step "${step.name}" needs exactly one of uses/run`);
        if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w./-]+@v\d+$/, `pin "${step.uses}" to a major version`);
        if (!step.run) continue;
        assert.doesNotMatch(step.run, /\$\{\{\s*(inputs|github\.event)\./, `step "${step.name}": pass inputs through env, not straight into the script`);
        if (hasBash) {
          const script = step.run.replace(/\$\{\{[^}]*\}\}/g, "X");
          const r = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
          assert.equal(r.status, 0, `step "${step.name}": ${r.stderr}`);
          assert.equal(r.stderr, "", `step "${step.name}": ${r.stderr}`);
        }
      }
    }
  });
}

test("Expo's cloud is only ever used for iOS, on the free queue", () => {
  for (const f of files) {
    const text = readFileSync(`.github/workflows/${f}`, "utf8");
    for (const m of text.matchAll(/\b(?:eas|args=\()[^\n]*\bbuild\b[^\n]*/g)) {
      if (/--platform/.test(m[0])) assert.match(m[0], /--platform ios/, `${f}: ${m[0]}`);
    }
    // Only lines that run Expo's cloud CLI (local `expo prebuild --platform android` is fine).
    for (const line of text.split("\n").filter((l) => /\beas\b/.test(l) && !/^\s*#/.test(l))) {
      assert.doesNotMatch(line, /--platform (android|all)|--priority|\beas (update|workflow)\b/, `${f}: ${line.trim()}`);
    }
  }
});
