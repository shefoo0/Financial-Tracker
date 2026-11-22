#!/usr/bin/env bash
# Runs each Maestro flow in a folder on its own, so a failure is reported per
# flow, and prints what was on screen when a flow failed (visible texts and
# testIDs from `maestro hierarchy`) straight into the GitHub Actions log: the
# screenshots are in the artifact, but the log is quicker to read.
#
#   scripts/run-maestro.sh <flows folder> <debug output folder> [maestro --device args...]
set -uo pipefail
mkdir -p "${2:-.}"

flows_dir="$1"; debug_dir="$2"; shift 2
failed=()
for flow in "$flows_dir"/*.yaml; do
  name="$(basename "$flow" .yaml)"
  echo "::group::Maestro flow $name"
  run_flow() { maestro "$@" test "$flow" --format junit --output "$debug_dir/$name.xml" --debug-output "$debug_dir/$name" 2>&1 | tee "$debug_dir/$name.out"; }
  ok=0
  run_flow "$@" && ok=1
  # The emulator sometimes drops offline for a moment ("device offline",
  # "Device server died"): that is not the app failing. Wait for it and retry
  # the flow once. App failures are never retried.
  if [ "$ok" = 0 ] && grep -qE "device offline|DeviceServerDiedException|device .* not found" "$debug_dir/$name.out" 2>/dev/null; then
    echo "::warning::The emulator dropped out during $name; waiting for it and retrying once."
    if command -v adb >/dev/null 2>&1; then
      adb wait-for-device 2>/dev/null || true
      for _ in $(seq 1 30); do [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 2; done
    else
      sleep 15
    fi
    run_flow "$@" && ok=1
  fi
  if [ "$ok" = 1 ]; then
    echo "::endgroup::"
  else
    echo "::endgroup::"
    failed+=("$name")
    echo "::error::Maestro flow $name failed. On screen at the time:"
    maestro "$@" hierarchy 2>/dev/null \
      | grep -oE '"(text|accessibilityText|resource-id|identifier|hintText)" *: *"[^"]+"' \
      | sed -E 's/"([^"]+)" *: *"([^"]+)"/  \1: \2/' | awk '!seen[$0]++' | head -80 || true
    # Maestro's own reason (a missing element, a bad step) from its debug log.
    echo "Maestro log for $name:"
    find "$debug_dir/$name" -name 'maestro.log' -exec grep -hiE 'exception|error|failed|not found|timeout' {} + 2>/dev/null | tail -15 || true
    # On Android, a crash of the app shows up in logcat.
    if command -v adb >/dev/null 2>&1; then
      echo "App crashes and JavaScript errors (logcat):"
      { adb logcat -d -b crash; adb logcat -d -s ReactNativeJS:E ReactNative:E AndroidRuntime:E; } 2>/dev/null | tail -40 || true
    fi
  fi
  command -v adb >/dev/null 2>&1 && adb logcat -c 2>/dev/null || true
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::Failed flows: ${failed[*]}"
  exit 1
fi
echo "All Maestro flows passed."
