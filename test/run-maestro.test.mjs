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
 * A fake `maestro` that fails the first `times` runs of flow 01 like the real one: the console says only "[Failed]",
 * and the reason is in maestro.log inside --debug-output. `reasons` are those logs, one per failing run (the last
 * repeats). Runs are counted in a file.
 */
function flakyMaestro(dir, reasons, times = 1) {
  const list = Array.isArray(reasons) ? reasons : [reasons];
  writeFileSync(join(dir, "reasons"), list.join("\n"));
  writeFileSync(join(dir, "bin", "maestro"), `#!/usr/bin/env bash
[ "$1" = "hierarchy" ] && exit 0
out=""; prev=""; for a in "$@"; do [ "$prev" = "--debug-output" ] && out="$a"; prev="$a"; done
case "$*" in *01-a.yaml*)
  n=$(cat "${join(dir, "count")}" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "${join(dir, "count")}"
  if [ "$n" -le ${times} ]; then
    mkdir -p "$out/run"
    reason=$(sed -n "\${n}p" "${join(dir, "reasons")}"); [ -n "$reason" ] || reason=$(tail -n 1 "${join(dir, "reasons")}")
    echo "$reason" > "$out/run/maestro.log"
    echo "[Failed] A (1s)"; exit 1
  fi;;
esac
echo "[Passed] $*"
`);
}

const ANDROID = '[ "$1" = "get-state" ] && echo device\n[ "$2" = "getprop" ] && echo 1\nexit 0';
const OFFLINE = "CommandFailed: Command failed (host:transport:emulator-5554): device offline";
const APP_BUG = "Assertion is false: id: plan-add-cost is visible";
const run = (dir, env) =>
  spawnSync("bash", [SCRIPT, join(dir, "flows"), join(dir, "debug")], { env: { ...env, MAESTRO_SETTLE_SLEEP: "0" }, encoding: "utf8", timeout: 60000 });

test("Android runner: retries a flow when maestro.log says the emulator went offline", () => {
  const { dir, env } = setup(ANDROID);
  flakyMaestro(dir, OFFLINE, 1);
  const r = run(dir, env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dropped out or showed a system pop-up during 01-a; waiting for it and retrying \(1 of 2\)/);
  assert.match(r.stdout, /All Maestro flows passed/);
});

test("Android runner: survives two drop-outs in a row (it happened on flow 08), waiting for a steady device", () => {
  const { dir, env } = setup(ANDROID);
  flakyMaestro(dir, OFFLINE, 2);
  const r = run(dir, env);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /retrying \(2 of 2\)/);
  const calls = readFileSync(join(dir, "adb.log"), "utf8");
  assert.ok((calls.match(/getprop sys.boot_completed/g)?.length ?? 0) >= 6, "three steady checks before each retry");
  assert.match(calls, /reconnect offline/);
});

test("Android runner: gives up after two retries", () => {
  const { dir, env } = setup(ANDROID);
  flakyMaestro(dir, OFFLINE, 3);
  const r = run(dir, env);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /retrying \(3 of/);
  assert.match(r.stdout, /Failed flows: 01-a/);
});

test("Android runner: a drop-out then a real app failure is not retried again (old logs are cleared)", () => {
  const { dir, env } = setup(ANDROID);
  flakyMaestro(dir, [OFFLINE, APP_BUG], 2);
  const r = run(dir, env);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /retrying \(1 of 2\)/);
  assert.doesNotMatch(r.stdout, /retrying \(2 of 2\)/);
});

test("Android runner: never retries a real app failure", () => {
  const { dir, env } = setup('[ "$1" = "get-state" ] && echo device\nexit 0');
  flakyMaestro(dir, APP_BUG, 1);
  const r = run(dir, env);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /retrying/);
  assert.match(r.stdout, /Failed flows: 01-a/);
});
