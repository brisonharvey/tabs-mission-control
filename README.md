# Tab Mission Control

Tab Mission Control is a browser-neutral tab overview project with separate Firefox and Chrome extension builds.

## Project structure

```text
Tab-Mission-Control/
├── chrome/
│   ├── background.js
│   ├── icons/
│   ├── manifest.json
│   ├── mission-control.css
│   ├── mission-control.html
│   ├── mission-control.js
│   └── README.md
├── firefox/
│   ├── background.js
│   ├── icons/
│   ├── manifest.json
│   ├── mission-control.css
│   ├── mission-control.html
│   ├── mission-control.js
│   └── README.md
└── README.md
```

## Firefox build

Load `/Users/brisonharvey/GitHub/Tab-Mission-Control/firefox` from `about:debugging`.

## Chrome build

Load `/Users/brisonharvey/GitHub/Tab-Mission-Control/chrome` from `chrome://extensions`.

## Shared shortcut

- Windows / Linux: `Ctrl+Shift+Y`
- macOS: `Command+Shift+Y`

You can customize extension shortcuts from each browser's extension shortcut settings if needed.

## Future enhancement ideas

- Drag-and-drop tab reordering
- Close buttons on tab cards
- Group tabs by browser window
- Recently closed tabs with the `sessions` API
- Persistent light/dark theme preference
