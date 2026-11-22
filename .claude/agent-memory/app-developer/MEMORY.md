# app-developer memory

Lessons from earlier apps, one line each. Newest at the bottom.

- Test SQLite repositories in Jest by mocking expo-sqlite with an adapter over Node 22's built-in node:sqlite (in-memory); run the same contract suite against the memory repository. (moneyplanner, 2026-11)
- In cloud sessions, prefix Expo CLI commands with EXPO_OFFLINE=1: Expo's servers are blocked. (moneyplanner, 2026-11)
- RN 0.88 supports boxShadow strings on all platforms; SVG gradient ids need useId() sanitised (no colons) for web. (moneyplanner, 2026-11)
- Jest picks up every file in __tests__ as a suite: keep fixtures/fakes in a sibling folder (e.g. testing/). Mock a parallel-built engine with a small fake so screen tests don't depend on it. (moneyplanner, 2026-11)
- Never unmount a navigator while data reloads (e.g. swapping the tab bar for a spinner when a query reloads after a save): it resets the tabs to the first one. Show a spinner only when there is no data yet. (moneyplanner, 2026-11)
- expo-router usePreventRemove: turning the guard off is applied on a later render, so going back right after setState is still blocked (iPhone modals stay open). Switch the guard off when the save STARTS, go back after the write + two frames, and never "repeat" an intended exit (on Android it went back twice and closed the app). (moneyplanner, 2026-11)
- iPhone number pads have no Return key: give each numeric field its own InputAccessoryView "Done" bar (one global bar at the root doesn't show over modal screens); also set keyboardDismissMode="on-drag" on scroll views. (moneyplanner, 2026-11)
- Don't open RN Modal pop-ups (pickers, sheets) over iOS modal-presented screens for form fields: they may not close. Use inline option lists (compact grid for long lists of short choices like days). A lock/privacy screen must not render the app underneath (Modals and native modals draw above overlays). (moneyplanner, 2026-11)
- expo-file-system SDK 58 new API: Directory.create({intermediates, idempotent}), File.move(dest,{overwrite}) for atomic temp-then-move writes, textSync exists; fake it in Jest with a Map-backed File/Directory mock. Skip auto-backups of un-onboarded profiles so empty copies don't rotate out real ones. (moneyplanner, 2026-11)
- Reports engine: balance at any date = startingBalance +/- flows (same flows as forecast); compare a 'so far' period with the same elapsed part of the earlier one. Free users: never run buildReport on own data. (moneyplanner, 2026-11)
- Home 'Coming up' shows one row per item (next payment), so after Paid the same title reappears with the next date; tests and walkthrough must compare keys/dates, not titles. (moneyplanner, 2026-11)
- Walkthrough taps by substring text ('Rent') can hit new always-on cards (Cheques card text mentions rent): tap exact. Never run git stash mid-task to compare baselines. (moneyplanner, 2026-11)
- New optional field on a shared type (Category.monthlyLimit): make it optional in the type and normalise to null in repos/backup, or every parallel dev's fixtures break tsc. Walkthrough static server (e2e-web/lib.mjs) sometimes crashes with ERR_HTTP_HEADERS_SENT: rerun. (moneyplanner, 2026-11)
