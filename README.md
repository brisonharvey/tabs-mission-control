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

## Current capabilities

- Drag-and-drop tab reordering, including moving tabs between browser windows
- Close buttons on tab cards and keyboard close support with `X`
- Tabs grouped by browser window in the Mission Control view
- Recently closed tabs restored through the `sessions` API
- Persistent `system` / `light` / `dark` theme preference
