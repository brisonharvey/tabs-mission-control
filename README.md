# Firefox Mission Control

Firefox Mission Control is a temporary-loadable WebExtension that opens a large, keyboard-first visual tab overview for the current Firefox window.

## Project structure

```text
firefox-mission-control/
├── background.js
├── icons/
│   ├── icon-16.svg
│   ├── icon-32.svg
│   ├── icon-48.svg
│   └── icon-96.svg
├── manifest.json
├── mission-control.css
├── mission-control.html
├── mission-control.js
└── README.md
```

## Load in Firefox

1. Open Firefox and go to `about:debugging`.
2. Select **This Firefox**.
3. Click **Load Temporary Add-on...**
4. Choose the file `/Users/brisonharvey/GitHub/firefox-mission-control/manifest.json`.
5. Use the toolbar button or the keyboard shortcut to open Mission Control.

## Default shortcut

- Windows / Linux: `Ctrl+Shift+Space`
- macOS: `Command+Shift+Space`

You can customize extension shortcuts from Firefox's add-on shortcut settings if this conflicts with another binding.

## Notes on Firefox limitations

- Firefox extensions cannot draw a true system-level overlay above browser chrome, so this MVP opens a large extension popup window instead.
- Live thumbnail previews are intentionally omitted in the MVP. Firefox provides capture APIs, but capturing every open tab reliably would require extra permissions and can be disruptive or slow for a keyboard-first flow. The UI uses polished fallback preview cards instead.

## Future enhancement ideas

- Drag-and-drop tab reordering
- Close buttons on tab cards
- Group tabs by browser window
- Recently closed tabs with the `sessions` API
- Persistent light/dark theme preference
