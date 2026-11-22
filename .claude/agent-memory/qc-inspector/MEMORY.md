# qc-inspector memory

Lessons from earlier apps, one line each. Newest at the bottom.

- Check `android.permissions` in app.json: an explicit list (even empty) can drop permissions the features need (POST_NOTIFICATIONS for local notifications, USE_BIOMETRIC); the Face ID usage string must be set when expo-local-authentication is used. (moneyplanner, 2026-11)
- A lock screen is only safe if nothing renders under it (sheets and native modals draw above overlays), it fails closed when the PIN can't be read, and notification text is generic for locked profiles. (moneyplanner, 2026-11)
