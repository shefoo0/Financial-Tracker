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
# Android-only helpers run only when an Android device is connected. GitHub's
# macOS runner has adb installed but no Android device, and adb commands then
# wait for one forever (this hung the iPhone run after its first flow).
android=0
if command -v adb >/dev/null 2>&1 && [ "$(adb get-state 2>/dev/null)" = "device" ]; then android=1; fi
# Never wait without a limit (macOS has no `timeout`: run without one there).
limit() { if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi; }
for flow in "$flows_dir"/*.yaml; do
  name="$(basename "$flow" .yaml)"
  echo "::group::Maestro flow $name"
  # Close stuck system pop-ups (e.g. "Pixel Launcher isn't responding") that would cover the app.
  close_system_dialogs() {
    [ "$android" = 1 ] || return 0
    limit 20 adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
    # A frozen launcher keeps its "isn't responding" dialog up: restart it.
    if [ "${1:-}" = "hard" ]; then limit 20 adb shell am force-stop com.google.android.apps.nexuslauncher >/dev/null 2>&1 || true; sleep 3; fi
  }
  close_system_dialogs
  run_flow() { maestro "$@" test "$flow" --format junit --output "$debug_dir/$name.xml" --debug-output "$debug_dir/$name" 2>&1 | tee "$debug_dir/$name.out"; }
  ok=0
  run_flow "$@" && ok=1
  # The emulator sometimes drops offline for a moment ("device offline",
  # "Device server died"): that is not the app failing. Wait for it and retry
  # the flow once. App failures are never retried.
  infra=0
  if [ "$ok" = 0 ]; then
    grep -qE "device offline|DeviceServerDiedException|device .* not found" "$debug_dir/$name.out" 2>/dev/null && infra=1
    # Only the system's own apps freezing counts; Money Planner crashing is a real failure.
    maestro "$@" hierarchy 2>/dev/null | grep -qE "(Pixel Launcher|System UI|Launcher3|Google Play services) isn.t responding" && infra=1
  fi
  if [ "$infra" = 1 ]; then
    close_system_dialogs hard
    echo "::warning::The emulator dropped out or showed a system pop-up during $name; waiting for it and retrying once."
    if [ "$android" = 1 ]; then
      limit 120 adb wait-for-device 2>/dev/null || true
      for _ in $(seq 1 30); do [ "$(limit 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 2; done
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
    if [ "$android" = 1 ]; then
      echo "App crashes and JavaScript errors (logcat):"
      { limit 30 adb logcat -d -b crash; limit 30 adb logcat -d -s ReactNativeJS:E ReactNative:E AndroidRuntime:E; } 2>/dev/null | tail -40 || true
    fi
  fi
  [ "$android" = 1 ] && { limit 20 adb logcat -c 2>/dev/null || true; }
done
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::Failed flows: ${failed[*]}"
  exit 1
fi
echo "All Maestro flows passed."
