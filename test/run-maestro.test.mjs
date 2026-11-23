import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../scripts/run-maestro.sh", import.meta.url).pathname;

/** A folder with two flows, a fake `maestro` that passes, and a fake `adb`. */
function setup(adbScript) {
  const dir = mkdtempSync(join(tmpdir(), "run-maestro-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "flows"));
  writeFileSync(join(dir, "flows", "01-a.yaml"), "appId: x\n---\n- launchApp\n");
  writeFileSync(join(dir, "flows", "02-b.yaml"), "appId: x\n---\n- launchApp\n");
  writeFileSync(join(bin, "maestro"), "#!/usr/bin/env bash\necho \"[Passed] $*\"\n");
  writeFileSync(join(bin, "adb"), `#!/usr/bin/env bash\necho "$*" >> "${join(dir, "adb.log")}"\n${adbScript}\n`);
  chmodSync(join(bin, "maestro"), 0o755);
  chmodSync(join(bin, "adb"), 0o755);
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

test("iPhone runner: adb installed but no Android device never waits for one", () => {
  // Real adb waits forever for a device on most commands; get-state fails at once.
  const { dir, env } = setup('[ "$1" = "get-state" ] && { echo "error: no devices/emulators found" >&2; exit 1; }\nsleep 600');
  const r = spawnSync("bash", [SCRIPT, join(dir, "flows"), join(dir, "debug"), "--device", "SIM"], { env, encoding: "utf8", timeout: 30000 });
  assert.equal(r.error, undefined, "the script hung (adb waiting for a device)");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Maestro flow 02-b/);
  assert.match(r.stdout, /All Maestro flows passed/);
  assert.deepEqual(readFileSync(join(dir, "adb.log"), "utf8").trim().split("\n"), ["get-state"]);
});

test("Android runner: closes system dialogs and clears logcat around each flow", () => {
  const { dir, env } = setup('[ "$1" = "get-state" ] && echo device\nexit 0');
  const r = spawnSync("bash", [SCRIPT, join(dir, "flows"), join(dir, "debug")], { env, encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const calls = readFileSync(join(dir, "adb.log"), "utf8");
  assert.equal(calls.match(/CLOSE_SYSTEM_DIALOGS/g)?.length, 2);
  assert.equal(calls.match(/logcat -c/g)?.length, 2);
});

/**
 * A fake `maestro` that fails the first run of flow 01 like the real one when the emulator drops out: the console
 * says only "[Failed]", and "device offline" is in maestro.log inside --debug-output. `reason` is what that log says.
 */
function flakyMaestro(dir, reason) {
  writeFileSync(join(dir, "bin", "maestro"), `#!/usr/bin/env bash
[ "$1" = "hierarchy" ] && exit 0
out=""; prev=""; for a in "$@"; do [ "$prev" = "--debug-output" ] && out="$a"; prev="$a"; done
case "$*" in *01-a.yaml*)
  if [ ! -f "${join(dir, "seen")}" ]; then
    touch "${join(dir, "seen")}"; mkdir -p "$out/run"
    echo "${reason}" > "$out/run/maestro.log"
    echo "[Failed] A (1s)"; exit 1
  fi;;
esac
echo "[Passed] $*"
`);
}

test("Android runner: retries a flow once when maestro.log says the emulator went offline", () => {
  const { dir, env } = setup('[ "$1" = "get-state" ] && echo device\n[ "$2" = "getprop" ] && echo 1\nexit 0');
  flakyMaestro(dir, "CommandFailed: Command failed (host:transport:emulator-5554): device offline");
  const r = spawnSync("bash", [SCRIPT, join(dir, "flows"), join(dir, "debug")], { env, encoding: "utf8", timeout: 60000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dropped out or showed a system pop-up during 01-a; waiting for it and retrying once/);
  assert.match(r.stdout, /All Maestro flows passed/);
});

test("Android runner: never retries a real app failure", () => {
  const { dir, env } = setup('[ "$1" = "get-state" ] && echo device\nexit 0');
  flakyMaestro(dir, "Assertion is false: id: plan-add-cost is visible");
  const r = spawnSync("bash", [SCRIPT, join(dir, "flows"), join(dir, "debug")], { env, encoding: "utf8", timeout: 60000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /retrying once/);
  assert.match(r.stdout, /Failed flows: 01-a/);
});
