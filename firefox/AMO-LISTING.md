# AMO Listing Draft

## Name

Tab Mission Control

## Summary

A keyboard-first visual overview for managing tabs across Firefox windows.

## Description

Tab Mission Control gives you a fast, visual workspace for navigating tabs across Firefox windows.

Browse open tabs as cards, search instantly, move through the layout with the keyboard, drag tabs to reorder them, restore recently closed tabs, and switch back to the tab you need without losing context.

### Features

- Visual tab overview across all Firefox windows
- Fast search by tab title and URL
- Keyboard navigation for quick tab switching
- Drag-and-drop tab reordering and moving tabs between windows
- Close tabs directly from the overview
- Restore recently closed tabs
- Hibernate discarded tabs and restore them when needed
- Light, dark, and system theme support

### Privacy

Tab Mission Control works locally in Firefox. It does not include analytics or telemetry, does not send browsing data to the developer or any third party, and stores only the selected theme preference locally.

## Suggested Categories

- Tabs
- Productivity

## Notes For Reviewers

- The add-on is a local-only tab manager.
- It uses `tabs`, `sessions`, and `storage` only for tab management and a saved theme preference.
- `data_collection_permissions.required = ["none"]` is declared in the manifest.
- No remote code, host permissions, content scripts, analytics, or telemetry are included.
- The add-on opens a dedicated popup window because extensions cannot draw a native Mission Control-style overlay above Firefox browser chrome.

## Privacy Policy On AMO

This add-on does not transmit user data from the device, so a hosted privacy policy should not be required by AMO. If you still want to provide one in the listing, use the contents of [PRIVACY.md](/Users/brisonharvey/GitHub/Tab-Mission-Control/PRIVACY.md).
