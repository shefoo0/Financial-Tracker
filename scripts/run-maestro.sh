#!/usr/bin/env bash
# Runs each Maestro flow in a folder on its own, so a failure is reported per
# flow, and prints what was on screen when a flow failed (visible texts and
# testIDs from `maestro hierarchy`) straight into the GitHub Actions log: the
# screenshots are in the artifact, but the log is quicker to read.
#
#   scripts/run-maestro.sh <flows folder> <debug output folder> [maestro --device args...]
set -uo pipefail

flows_dir="$1"; debug_dir="$2"; shift 2
failed=()
for flow in "$flows_dir"/*.yaml; do
  name="$(basename "$flow" .yaml)"
  echo "::group::Maestro flow $name"
  if maestro "$@" test "$flow" --format junit --output "$debug_dir/$name.xml" --debug-output "$debug_dir/$name"; then
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
