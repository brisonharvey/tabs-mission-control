# Tab Mission Control for Firefox

This folder contains the Firefox build of Tab Mission Control.

## Load in Firefox

1. Open Firefox and go to `about:debugging`.
2. Select **This Firefox**.
3. Click **Load Temporary Add-on...**
4. Choose `/Users/brisonharvey/GitHub/Tab-Mission-Control/firefox/manifest.json`.
5. Use the toolbar button or `Ctrl+Shift+Y` / `Command+Shift+Y`.

## Notes

- Firefox uses the `browser.*` WebExtensions APIs directly.
- Firefox extensions cannot draw a true system-level overlay above browser chrome, so this build opens a large popup window instead.
- Hibernate mode maps to Firefox's real discarded-tab state. Active tabs cannot be discarded until you switch away from them.
- The popup now groups tabs by window, supports drag-and-drop tab moves, restores recently closed tabs, and saves the selected theme preference with extension storage.
- Privacy: the extension does not send browsing data anywhere, includes no analytics or telemetry, and stores only the local theme preference. See [PRIVACY.md](/Users/brisonharvey/GitHub/Tab-Mission-Control/PRIVACY.md).
- Firefox add-on note: the manifest declares `data_collection_permissions.required = ["none"]`, matching the extension's local-only behavior.
