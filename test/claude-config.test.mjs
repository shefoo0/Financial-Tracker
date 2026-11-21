import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A light YAML sanity check for agent and command frontmatter, so a stray
// bracket or quote can't silently break how Claude Code loads them.
function frontmatter(file) {
  const text = readFileSync(file, "utf8");
  assert.ok(text.startsWith("---\n"), `${file}: frontmatter must start on line 1`);
  const end = text.indexOf("\n---\n", 4);
  assert.ok(end > 0, `${file}: frontmatter must be closed with ---`);
  const fields = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    assert.ok(m, `${file}: can't parse frontmatter line "${line}"`);
    const v = m[2];
    if (/^[[{"'>|!&*%@`]/.test(v)) {
      assert.match(v, /^'.*'$|^".*"$/, `${file}: ${m[1]} starts with a YAML special character; wrap the whole value in single quotes`);
    }
    fields[m[1]] = v.replace(/^'(.*)'$/, "$1");
  }
  return fields;
}

const dir = (d) => readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => join(d, f));

test("sub-agents have valid frontmatter and can't delegate further", () => {
  for (const f of dir(".claude/agents")) {
    const fm = frontmatter(f);
    assert.ok(fm.name && fm.description, `${f}: needs name and description`);
    assert.ok(fm.tools, `${f}: list tools explicitly`);
    assert.doesNotMatch(fm.tools, /\bAgent\b/, `${f}: sub-agents must not have the Agent tool`);
    assert.match(fm.maxTurns ?? "", /^\d+$/, `${f}: set maxTurns`);
  }
});

test("commands have valid frontmatter", () => {
  for (const f of dir(".claude/commands")) {
    const fm = frontmatter(f);
    assert.ok(fm.description, `${f}: needs a description`);
  }
});

test("settings.json is valid and wires up the Bash guard", () => {
  const s = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
  const cmds = s.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(cmds.some((c) => c.includes("guard-bash.mjs")));
  assert.ok(s.permissions.deny.includes("Read(~/.app-signing/**)"));
});
