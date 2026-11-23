#!/usr/bin/env node
// Checks an app's Maestro flows against its source BEFORE they run on an
// emulator or simulator (a device run costs ~30 minutes; this takes a second).
//
//   node scripts/check-maestro.mjs apps/<slug>
//
// It catches the mistakes that broke real device runs:
//   - a testID the flow taps or asserts that doesn't exist in the app
//     (ids like `debt-item-0` match a template such as `debt-item-${i}`);
//   - a quoted text the flow asserts that appears nowhere in the app (use a
//     regex like "Rent.*" for list rows: on iPhone a row reads as one label);
//   - raw `hideKeyboard` (on iPhone it taps the screen; use the common
//     dismiss-keyboard subflows);
//   - `inputText` right after tapping a field without `eraseText`, when the
//     field may start filled in (warning only);
//   - a bare amount asserted as exact text ("AED 20,000.00"): on iPhone it sits
//     inside its row's or card's label, so use ".*AED 20,000.00.*";
//   - `runFlow` files that don't exist.
// Exit code 1 on errors; warnings are printed but don't fail.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseAllDocuments } from "yaml";

/** All source text of the app (src/**), for id and text lookups. */
export function readSources(appDir) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(readFileSync(p, "utf8"));
    }
  };
  walk(join(appDir, "src"));
  return out.join("\n");
}

/** testIDs the source can produce: literal strings and template prefixes. */
export function knownIds(source) {
  const literal = new Set();
  const prefixes = new Set();
  for (const m of source.matchAll(/testID[=:]\s*\{?\s*["'`]([^"'`$]+)["'`]/g)) literal.add(m[1]);
  for (const m of source.matchAll(/["'`]([a-z0-9][a-z0-9-]*)["'`]/g)) literal.add(m[1]); // ids passed as props
  for (const m of source.matchAll(/`([a-z0-9][a-z0-9-]*-)\$\{/g)) prefixes.add(m[1]);
  // `${testID}-option-${value}` style: suffix templates combine with any literal id.
  const suffixes = new Set();
  for (const m of source.matchAll(/`\$\{[a-zA-Z.]+\}(-[a-z0-9-]*-?)(\$\{)?/g)) suffixes.add(m[1]);
  return { literal, prefixes, suffixes };
}

export function idExists(id, known) {
  if (known.literal.has(id)) return true;
  for (const p of known.prefixes) if (id.startsWith(p) && id.length > p.length) return true;
  for (const s of known.suffixes) {
    const i = id.indexOf(s);
    if (i > 0 && known.literal.has(id.slice(0, i))) return true;
  }
  return false;
}

const isRegex = (t) => /[.*+?^$()[\]{}|\\]/.test(t);

/** Walks a flow's commands (including nested runFlow/repeat commands), with the platform they're limited to. */
function* commands(list, platform = null) {
  for (const cmd of list ?? []) {
    yield { cmd, platform };
    if (cmd && typeof cmd === "object") {
      for (const v of Object.values(cmd)) {
        if (v && typeof v === "object" && Array.isArray(v.commands)) yield* commands(v.commands, v.when?.platform ?? platform);
      }
    }
  }
}

/** Element selectors in a command: { id } or { text }. */
function selectors(cmd) {
  const out = [];
  if (!cmd || typeof cmd !== "object") return out;
  for (const [name, arg] of Object.entries(cmd)) {
    if (!/^(tapOn|assertVisible|assertNotVisible|scrollUntilVisible|longPressOn|doubleTapOn|copyTextFrom)$/.test(name)) continue;
    const target = name === "scrollUntilVisible" ? arg?.element : arg;
    if (typeof target === "string") out.push({ text: target, command: name });
    else if (target && typeof target === "object") {
      if (target.id) out.push({ id: target.id, command: name, optional: target.optional ?? arg?.optional });
      if (target.text) out.push({ text: target.text, command: name, optional: target.optional ?? arg?.optional });
    }
  }
  return out;
}

export function checkFlow(file, source, known) {
  const errors = [];
  const warnings = [];
  const docs = parseAllDocuments(readFileSync(file, "utf8")).map((d) => d.toJS());
  const flow = docs.find((d) => Array.isArray(d)) ?? [];
  let lastTapWasField = false;
  const typed = [];
  for (const { cmd, platform } of commands(flow)) {
    if (cmd && typeof cmd === "object" && typeof cmd.inputText === "string") typed.push(cmd.inputText);
    if (cmd === "hideKeyboard" && platform !== "Android") {
      errors.push(`${file}: raw hideKeyboard (on iPhone it taps the screen) — use runFlow: common/dismiss-text-keyboard.yaml or common/dismiss-keyboard.yaml`);
    }
    if (cmd && typeof cmd === "object" && cmd.runFlow) {
      const target = typeof cmd.runFlow === "string" ? cmd.runFlow : cmd.runFlow.file;
      if (target && !existsSync(resolve(dirname(file), target))) errors.push(`${file}: runFlow file not found: ${target}`);
    }
    for (const s of selectors(cmd)) {
      if (s.id && !idExists(s.id, known)) errors.push(`${file}: ${s.command} id "${s.id}" doesn't exist in the app's source`);
      if (s.text && s.command === "assertVisible" && platform !== "Android" && /^[-+]?(?:[A-Z]{3} )?\d[\d,.]*$/.test(s.text)) {
        errors.push(`${file}: assertVisible "${s.text}" is a bare amount: on iPhone it sits inside its row's or card's label (one accessibility label), so it never matches on its own — use ".*${s.text}.*"`);
        continue;
      }
      if (s.text && !s.optional && s.command !== "assertNotVisible") {
        if (isRegex(s.text)) continue;
        // Text the flow typed itself (a name, a payee) shows up as data, not in the source.
        if (typed.some((t) => t && s.text.includes(t))) continue;
        if (!source.includes(s.text)) errors.push(`${file}: ${s.command} text "${s.text}" isn't in the app's source (typo, or a dynamic text: use a regex like "${s.text}.*")`);
      }
    }
    // inputText straight after tapping a field: the field may start filled in.
    if (cmd && typeof cmd === "object" && "inputText" in cmd && lastTapWasField) {
      warnings.push(`${file}: inputText "${cmd.inputText}" right after tapping a field — if the field can start filled in, add eraseText first`);
    }
    lastTapWasField = !!(cmd && typeof cmd === "object" && cmd.tapOn && typeof cmd.tapOn === "object" && /(day|count|every)$/.test(String(cmd.tapOn.id ?? "")));
  }
  return { errors, warnings };
}

export function checkApp(appDir) {
  const source = readSources(appDir);
  const known = knownIds(source);
  const files = [];
  for (const dir of [".maestro", ".maestro-screens"]) {
    const d = join(appDir, dir);
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) if (name.endsWith(".yaml")) files.push(join(d, name));
    const common = join(d, "common");
    if (existsSync(common)) for (const name of readdirSync(common)) if (name.endsWith(".yaml")) files.push(join(common, name));
  }
  const errors = [];
  const warnings = [];
  for (const f of files) {
    const r = checkFlow(f, source, known);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { files, errors, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const appDir = process.argv[2];
  if (!appDir) {
    console.error("Usage: node scripts/check-maestro.mjs apps/<slug>");
    process.exit(2);
  }
  const { files, errors, warnings } = checkApp(appDir);
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`error: ${e}`);
  console.log(`${files.length} flow files checked: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length ? 1 : 0);
}
