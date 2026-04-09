# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies (Node.js 20+ required)
npm test             # Run all tests
npm run test:coverage  # Run tests with coverage report
npm run generate-icons  # Generate icons/icon16.png, icon48.png, icon128.png (run once after install)
```

To run a single test file:
```bash
npx jest tests/content.test.js
npx jest tests/popup.test.js
```

## Architecture

This is a Chrome Extension (Manifest V3) that intercepts keyboard events on `https://chat.google.com/*` and `https://mail.google.com/*` (Gmail integrated Chat) to remap the line-break key in Google Chat's message composer.

**Key files:**

- [manifest.json](manifest.json) — MV3 manifest; declares `storage` permission, injects `src/content.js` at `document_idle` on both `chat.google.com` and `mail.google.com`, sets popup to `src/popup.html`
- [src/content.js](src/content.js) — Content script. Runs in the page context. Listens for `keydown` in **capture phase** (so it fires before Google Chat's own handlers). Reads/watches `chrome.storage.sync` for the configured key and calls `document.execCommand('insertText', false, '\n')` to insert a newline when the combo matches.
- [src/popup.js](src/popup.js) — Popup script. Renders radio buttons for key selection and persists the choice to `chrome.storage.sync`.

**Data flow:**
1. User picks a key combo in the popup → saved to `chrome.storage.sync.lineBreakKey`
2. Content script loads the setting on init and listens to `chrome.storage.onChanged` for live updates (no page reload required)
3. On each `keydown`, the handler checks: not composing (IME guard), target is a Google Chat input, no suggestion/autocomplete dropdown open (`aria-expanded="true"` traversed up the DOM), then matches the configured combo

**Gmail integration:** On `mail.google.com`, the extension must distinguish Chat inputs from Gmail's own compose editor (both use `contenteditable`). It does this by checking for a `data-group-id` attribute starting with `"space/"` on ancestor elements — this attribute is specific to Google Chat panels embedded in Gmail. On `chat.google.com`, all editable elements are Chat inputs, so no additional filtering is needed.

**Valid values for `lineBreakKey`:** `'Enter'` (default), `'Shift+Enter'`, `'Ctrl+Enter'`, `'Alt+Enter'`

**Cross-platform note:** `Ctrl+Enter` also accepts `metaKey` (⌘) on macOS only. On Windows/Linux, `metaKey` is the Win/Super key and is intentionally excluded.

**Testing approach:** Both `content.js` and `popup.js` export their functions via CommonJS when `module.exports` is defined (i.e. in Jest/Node), and auto-initialize only when `chrome.storage` is present (i.e. in the real extension). Tests use `jest.resetModules()` to get a fresh module state per test and mock `global.chrome`.

## Release

Releases are created via GitHub Actions (`.github/workflows/release.yml`). Pushing a `v*` tag or triggering `workflow_dispatch` with a `vX.Y.Z` tag name runs tests, generates icons, zips `manifest.json + src/ + icons/`, and creates a GitHub Release.
