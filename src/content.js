'use strict';

// --- Constants ---

/** Default line break key setting */
const DEFAULT_LINE_BREAK_KEY = 'Enter';

/** Allowed values for the line break key setting */
const VALID_LINE_BREAK_KEYS = ['Enter', 'Shift+Enter', 'Ctrl+Enter', 'Alt+Enter'];

/** Currently configured line break key */
let lineBreakKey = DEFAULT_LINE_BREAK_KEY;

/**
 * Returns the value if it is a recognised line break key, otherwise returns
 * the default.  Prevents unexpected values from chrome.storage reaching the
 * rest of the logic.
 * @param {*} value
 * @returns {string}
 */
function sanitizeLineBreakKey(value) {
  return VALID_LINE_BREAK_KEYS.includes(value) ? value : DEFAULT_LINE_BREAK_KEY;
}

// --- Platform Detection ---

/**
 * Returns true when the content script is running on macOS.
 *
 * Uses navigator.userAgentData when available (Chrome 90+) and falls back to
 * navigator.platform for older environments (e.g. jsdom in tests).
 * @returns {boolean}
 */
function isMac() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === 'macOS';
  }
  return /Mac|MacIntel|MacPPC|Mac68K/.test(navigator.platform || '');
}

// --- Pure Logic Functions ---

/**
 * Checks whether a keyboard event matches the configured line break key combo.
 *
 * Cross-platform notes:
 *   - 'Ctrl+Enter'  accepts Ctrl on all platforms and additionally ⌘ Command
 *                   (metaKey) on macOS only.  On Windows/Linux metaKey is the
 *                   Windows/Super key and is intentionally not treated as Ctrl.
 *   - 'Alt+Enter'   accepts Alt (Windows/Linux) and ⌥ Option (Mac); both set
 *                   event.altKey = true in Chrome on all platforms.
 *   - Modifier combinations that include extra keys are intentionally rejected
 *     (e.g. Ctrl+Shift+Enter does NOT match 'Ctrl+Enter').
 *
 * @param {KeyboardEvent} event
 * @param {string} key - One of 'Enter', 'Shift+Enter', 'Ctrl+Enter', 'Alt+Enter'
 * @returns {boolean}
 */
function matchesLineBreakKey(event, key) {
  if (event.key !== 'Enter') return false;

  switch (key) {
    case 'Enter':
      return !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
    case 'Shift+Enter':
      return event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
    case 'Ctrl+Enter': {
      // ctrlKey → Ctrl on all platforms.
      // metaKey → ⌘ Command on Mac only; on Windows/Linux it is the Win/Super
      //           key and should not be treated as Ctrl.
      const metaAllowed = event.metaKey && isMac();
      return (event.ctrlKey || metaAllowed) &&
        !(event.ctrlKey && event.metaKey) &&
        !event.shiftKey &&
        !event.altKey;
    }
    case 'Alt+Enter':
      // altKey → Alt on Windows / Linux, ⌥ Option on Mac
      // Exclude metaKey so that ⌘+⌥+Enter does not accidentally match.
      return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey;
    default:
      return false;
  }
}

/**
 * Checks whether the target element is an editable input area (textarea or
 * contenteditable element) that is part of the Google Chat message composer.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isGoogleChatInput(target) {
  if (!target || typeof target.tagName === 'undefined') return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'textarea') return true;

  if (typeof target.getAttribute === 'function') {
    const contentEditable = target.getAttribute('contenteditable');
    if (
      contentEditable === '' ||
      contentEditable === 'true' ||
      contentEditable === 'plaintext-only'
    ) {
      return true;
    }
    if (target.getAttribute('role') === 'textbox') return true;
  }

  return false;
}

/**
 * Checks whether a suggestion/autocomplete dropdown (e.g. a mention list) is
 * currently active for the given element.
 *
 * Three detection strategies are used in order:
 *
 * 1. aria-activedescendant on the target — set by the browser/framework when a
 *    dropdown option is actively highlighted, regardless of DOM layout.
 * 2. aria-expanded="true" traversal — Google Chat sometimes sets this on the
 *    textbox itself or on a parent wrapper element.
 * 3. Document-level [role="listbox"] lookup — Google Chat renders the mention
 *    autocomplete as a floating overlay (portal) that is NOT an ancestor of the
 *    input, so strategies 1 and 2 can miss it.  Checking the whole document
 *    handles that case.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isSuggestionDropdownOpen(target) {
  if (!target || typeof target.getAttribute !== 'function') return false;

  // 1. aria-activedescendant being set means a dropdown option is highlighted.
  if (target.getAttribute('aria-activedescendant')) return true;

  // 2. Traverse ancestors for aria-expanded="true".
  let el = target;
  while (el && typeof el.getAttribute === 'function') {
    if (el.getAttribute('aria-expanded') === 'true') return true;
    el = el.parentElement || null;
  }

  // 3. Check for a listbox anywhere in the document (covers portal-rendered
  //    mention/autocomplete dropdowns that are not in the input's ancestor chain).
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    if (document.querySelector('[role="listbox"]')) return true;
  }

  return false;
}

/**
 * Inserts a newline at the current cursor position.
 * Uses execCommand so that React-based editors (like Google Chat) receive the
 * corresponding 'input' event and update their internal state correctly.
 */
function insertNewline() {
  // execCommand is deprecated but still the most reliable way to trigger
  // the browser's native input path for contenteditable elements.
  document.execCommand('insertText', false, '\n');
}

// --- Event Handler ---

/**
 * Keydown event handler installed in capture phase so it runs before Google
 * Chat's own handlers.
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
  // Skip while IME is composing – critical for Japanese / CJK input.
  // keyCode 229 is the legacy indicator used by some browsers.
  if (event.isComposing || event.keyCode === 229) return;

  // Only care about the Enter key.
  if (event.key !== 'Enter') return;

  // Only act inside a Google Chat editable area.
  if (!isGoogleChatInput(event.target)) return;

  // When a mention / autocomplete dropdown is visible, let the browser handle
  // Enter so the user can select the highlighted suggestion normally.
  if (isSuggestionDropdownOpen(event.target)) return;

  // When the pressed combo is the configured line break key, insert a newline
  // and prevent Google Chat from treating it as a "send" action.
  if (matchesLineBreakKey(event, lineBreakKey)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    insertNewline();
  }
}

// --- Chrome Storage Integration ---

/**
 * Reacts to chrome.storage changes so that the popup and content script stay
 * in sync without requiring a page reload.
 * @param {Object} changes
 * @param {string} area
 */
function onStorageChanged(changes, area) {
  if (area === 'sync' && changes.lineBreakKey) {
    lineBreakKey = sanitizeLineBreakKey(
      changes.lineBreakKey.newValue !== undefined
        ? changes.lineBreakKey.newValue
        : DEFAULT_LINE_BREAK_KEY
    );
  }
}

/**
 * Loads the saved setting and registers all listeners.
 * Called once when the content script is injected into the page.
 */
function init() {
  // Register synchronously so this listener is added before Google Chat's own
  // handlers. lineBreakKey defaults to DEFAULT_LINE_BREAK_KEY until storage
  // resolves asynchronously below.
  document.addEventListener('keydown', handleKeyDown, true);

  chrome.storage.sync.get({ lineBreakKey: DEFAULT_LINE_BREAK_KEY }, (data) => {
    lineBreakKey = sanitizeLineBreakKey(data.lineBreakKey);
  });
  chrome.storage.onChanged.addListener(onStorageChanged);
}

// --- Entry Point ---

// Only auto-start in the actual browser extension context.
if (typeof chrome !== 'undefined' && chrome.storage) {
  init();
}

// --- Exports (used by Jest unit tests) ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_LINE_BREAK_KEY,
    VALID_LINE_BREAK_KEYS,
    isMac,
    sanitizeLineBreakKey,
    matchesLineBreakKey,
    isGoogleChatInput,
    isSuggestionDropdownOpen,
    insertNewline,
    handleKeyDown,
    onStorageChanged,
    getLineBreakKey: () => lineBreakKey,
    setLineBreakKey: (key) => {
      lineBreakKey = key;
    },
  };
}
