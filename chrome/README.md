# Tab Mission Control for Chrome

This folder contains the Chrome MV3 build of Mission Control.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/brisonharvey/GitHub/Tab-Mission-Control/chrome`.
5. Use the toolbar button or `Ctrl+Shift+Y` / `Command+Shift+Y`.

## Notes

- Chrome uses a Manifest V3 service worker in [`background.js`](/Users/brisonharvey/GitHub/Tab-Mission-Control/chrome/background.js) instead of Firefox's event page style background script.
- The tab manager UI is the same conceptually as Firefox, but the code uses a browser-neutral API wrapper in [`mission-control.js`](/Users/brisonharvey/GitHub/Tab-Mission-Control/chrome/mission-control.js) so it can talk to either `browser.*` or `chrome.*`.
- Like Firefox, Chrome extensions cannot draw above browser chrome, so this opens a focused popup window sized to the current browser window.
- The popup now shows every normal browser window, supports drag-and-drop tab moves, restores recently closed tabs, and saves the selected theme preference with extension storage.
- Privacy: the extension does not send browsing data anywhere, includes no analytics or telemetry, and stores only the local theme preference. See [PRIVACY.md](/Users/brisonharvey/GitHub/Tab-Mission-Control/PRIVACY.md).
- Chrome Web Store note: the store listing should link to a hosted copy of [PRIVACY.md](/Users/brisonharvey/GitHub/Tab-Mission-Control/PRIVACY.md) and the dashboard privacy answers should reflect that tab/session data is used only locally for the single tab-management feature and is not sold or transferred.
