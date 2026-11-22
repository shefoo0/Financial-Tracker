import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkApp, idExists, knownIds } from "../scripts/check-maestro.mjs";

function fakeApp(flows, source) {
  const dir = mkdtempSync(join(tmpdir(), "maestro-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, ".maestro", "common"), { recursive: true });
  writeFileSync(join(dir, "src", "screen.tsx"), source);
  writeFileSync(join(dir, ".maestro", "common", "dismiss.yaml"), "appId: x\n---\n- runFlow:\n    when:\n      platform: Android\n    commands:\n      - hideKeyboard\n");
  for (const [name, body] of Object.entries(flows)) writeFileSync(join(dir, ".maestro", name), `appId: x\n---\n${body}`);
  return dir;
}

const SOURCE = `
  <Button testID="save" label="Save" />
  <Row testID={\`item-\${i}\`} />
  <Select testID="payday" /> {/* options: \`\${testID}-option-\${o.value}\` */}
  <T>Nothing in this month</T>
`;

test("ids: literals, template prefixes and suffix templates", () => {
  const known = knownIds(SOURCE + "const a = `${testID}-option-${v}`;");
  assert.ok(idExists("save", known));
  assert.ok(idExists("item-3", known));
  assert.ok(idExists("payday-option-25", known));
  assert.ok(!idExists("sav", known));
  assert.ok(!idExists("missing-button", known));
});

test("a flow with only real ids and texts passes", () => {
  const dir = fakeApp(
    {
      "01-ok.yaml": '- tapOn:\n    id: save\n- assertVisible: "Nothing in this month"\n- assertVisible: "Rent.*"\n- tapOn:\n    id: item-0\n- runFlow: common/dismiss.yaml\n',
    },
    SOURCE,
  );
  const r = checkApp(dir);
  assert.deepEqual(r.errors, []);
});

test("catches a missing id, an unknown text, raw hideKeyboard and a missing subflow", () => {
  const dir = fakeApp(
    {
      "02-bad.yaml": '- tapOn:\n    id: sav\n- assertVisible: "Nothing this month"\n- hideKeyboard\n- runFlow: common/nope.yaml\n',
    },
    SOURCE,
  );
  const r = checkApp(dir);
  assert.equal(r.errors.length, 4, r.errors.join("\n"));
  assert.match(r.errors.join("\n"), /id "sav"/);
  assert.match(r.errors.join("\n"), /text "Nothing this month"/);
  assert.match(r.errors.join("\n"), /raw hideKeyboard/);
  assert.match(r.errors.join("\n"), /nope\.yaml/);
});

test("text the flow typed itself counts as present", () => {
  const dir = fakeApp({ "03-typed.yaml": '- tapOn:\n    id: save\n- inputText: "Layla"\n- assertVisible: "Setting up Layla"\n' }, SOURCE);
  assert.deepEqual(checkApp(dir).errors, []);
});

test("warns when typing into a day/count field without clearing it", () => {
  const dir = fakeApp({ "04-warn.yaml": '- tapOn:\n    id: debt-day\n- inputText: "15"\n' }, SOURCE + '<F testID="debt-day" />');
  const r = checkApp(dir);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 1);
});
