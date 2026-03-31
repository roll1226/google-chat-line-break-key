'use strict';

/** Default line break key */
const DEFAULT_LINE_BREAK_KEY = 'Enter';

// --- Platform Detection ---

/**
 * Returns true when the extension is running on macOS.
 *
 * Uses the modern navigator.userAgentData API when available (supported in
 * Chrome 90+ and other modern browsers) and falls back to navigator.platform
 * for older environments such as jsdom used in tests.
 * @returns {boolean}
 */
function isMac() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === 'macOS';
  }
  return /Mac|MacIntel|MacPPC|Mac68K/.test(navigator.platform || '');
}

/**
 * Returns platform-appropriate display strings for the Ctrl/Cmd and Alt/Option
 * modifier keys.
 * @returns {{ ctrlLabel: string, ctrlDesc: string, altLabel: string, altDesc: string }}
 */
function getPlatformKeyLabels() {
  if (isMac()) {
    return {
      ctrlLabel: '⌘ + Enter',
      ctrlDesc: '⌘+Enterで改行（Macの場合）',
      altLabel: '⌥ + Enter',
      altDesc: '⌥+Enterで改行（Macの場合）',
    };
  }
  return {
    ctrlLabel: 'Ctrl + Enter',
    ctrlDesc: 'Ctrl+Enterで改行',
    altLabel: 'Alt + Enter',
    altDesc: 'Alt+Enterで改行',
  };
}

/**
 * Updates the Ctrl+Enter and Alt+Enter option labels in the popup to show the
 * platform-appropriate key names (⌘/⌥ on Mac, Ctrl/Alt on Windows and Linux).
 */
function updatePlatformLabels() {
  const { ctrlLabel, ctrlDesc, altLabel, altDesc } = getPlatformKeyLabels();

  const ctrlLabelEl = document.getElementById('ctrl-enter-label');
  const ctrlDescEl = document.getElementById('ctrl-enter-desc');
  const altLabelEl = document.getElementById('alt-enter-label');
  const altDescEl = document.getElementById('alt-enter-desc');

  if (ctrlLabelEl) ctrlLabelEl.textContent = ctrlLabel;
  if (ctrlDescEl) ctrlDescEl.textContent = ctrlDesc;
  if (altLabelEl) altLabelEl.textContent = altLabel;
  if (altDescEl) altDescEl.textContent = altDesc;
}

// --- Core Functions ---

/**
 * Syncs the `.selected` CSS class on each `.option` element to match which
 * radio button is currently checked.
 *
 * Using a JS-managed class avoids relying on the CSS `:has()` selector, which
 * requires Chrome 105+.
 */
function syncSelectedClass() {
  const radios = document.querySelectorAll('input[name="lineBreakKey"]');
  radios.forEach((radio) => {
    const option = radio.closest('.option');
    if (!option) return;
    option.classList.toggle('selected', radio.checked);
  });
}

/**
 * Reads the saved line break key from chrome.storage.sync and checks the
 * matching radio button in the popup.
 */
function loadSetting() {
  chrome.storage.sync.get({ lineBreakKey: DEFAULT_LINE_BREAK_KEY }, (data) => {
    const radios = document.querySelectorAll('input[name="lineBreakKey"]');
    radios.forEach((radio) => {
      radio.checked = radio.value === data.lineBreakKey;
    });
    syncSelectedClass();
  });
}

/**
 * Persists the selected line break key to chrome.storage.sync.
 * @param {Event} event - The 'change' event fired by the radio button.
 */
function handleChange(event) {
  const selectedKey = event.target.value;
  syncSelectedClass();
  chrome.storage.sync.set({ lineBreakKey: selectedKey }, () => {
    showStatus('保存しました ✓');
  });
}

/** Tracks the current hide-timeout so rapid saves don't flicker the status. */
let statusTimeoutId = null;

/**
 * Briefly displays a status message at the bottom of the popup.
 * @param {string} message
 */
function showStatus(message) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.classList.add('show');

  clearTimeout(statusTimeoutId);
  statusTimeoutId = setTimeout(() => {
    statusEl.classList.remove('show');
  }, 2000);
}

/**
 * Wires up event listeners after the DOM is ready.
 * Separated from DOMContentLoaded registration so it can be called in tests.
 */
function init() {
  updatePlatformLabels();
  loadSetting();

  const radios = document.querySelectorAll('input[name="lineBreakKey"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', handleChange);
  });
}

// --- Entry Point ---

// Auto-initialize only when running inside the actual browser extension.
if (typeof chrome !== 'undefined' && chrome.storage) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// --- Exports (used by Jest unit tests) ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_LINE_BREAK_KEY,
    isMac,
    getPlatformKeyLabels,
    updatePlatformLabels,
    syncSelectedClass,
    loadSetting,
    handleChange,
    showStatus,
    init,
  };
}
