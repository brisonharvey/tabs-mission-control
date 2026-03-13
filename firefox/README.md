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
