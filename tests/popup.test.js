'use strict';

/**
 * Unit tests for src/popup.js
 *
 * Each test sets up the minimal DOM that popup.js expects before requiring
 * the module, so the module-level auto-init code does not run (chrome is
 * not globally defined until the test explicitly sets it up).
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build the minimal popup DOM inside document.body */
function setupDOM() {
  document.body.innerHTML = `
    <div id="status" class="status"></div>
    <label class="option"><input type="radio" name="lineBreakKey" value="Enter" /></label>
    <label class="option"><input type="radio" name="lineBreakKey" value="Shift+Enter" /></label>
    <label class="option"><input type="radio" name="lineBreakKey" value="Ctrl+Enter" /></label>
    <label class="option"><input type="radio" name="lineBreakKey" value="Alt+Enter" /></label>
  `;
}

/** Create a mock chrome storage API */
function makeChromeStorage(savedKey = 'Enter') {
  return {
    storage: {
      sync: {
        get: jest.fn((_defaults, cb) => cb({ lineBreakKey: savedKey })),
        set: jest.fn((_data, cb) => cb && cb()),
      },
    },
  };
}

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  setupDOM();
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  delete global.chrome;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── loadSetting ────────────────────────────────────────────────────────────

describe('loadSetting', () => {
  it('checks the radio matching the stored key', () => {
    global.chrome = makeChromeStorage('Shift+Enter');
    const { loadSetting } = require('../src/popup');

    loadSetting();

    const radios = document.querySelectorAll('input[name="lineBreakKey"]');
    const checked = [...radios].find((r) => r.checked);
    expect(checked.value).toBe('Shift+Enter');
  });

  it('checks "Enter" radio when storage returns the default', () => {
    global.chrome = makeChromeStorage('Enter');
    const { loadSetting } = require('../src/popup');

    loadSetting();

    const enterRadio = document.querySelector('input[value="Enter"]');
    expect(enterRadio.checked).toBe(true);
  });

  it('only checks one radio at a time', () => {
    global.chrome = makeChromeStorage('Ctrl+Enter');
    const { loadSetting } = require('../src/popup');

    loadSetting();

    const checked = [...document.querySelectorAll('input[name="lineBreakKey"]')].filter(
      (r) => r.checked
    );
    expect(checked).toHaveLength(1);
    expect(checked[0].value).toBe('Ctrl+Enter');
  });
});

// ── syncSelectedClass ─────────────────────────────────────────────────────

describe('syncSelectedClass', () => {
  it('adds "selected" to the parent .option of the checked radio', () => {
    global.chrome = makeChromeStorage('Enter');
    const { syncSelectedClass } = require('../src/popup');

    const radio = document.querySelector('input[value="Shift+Enter"]');
    radio.checked = true;
    syncSelectedClass();

    const option = radio.closest('.option');
    expect(option.classList.contains('selected')).toBe(true);
  });

  it('removes "selected" from unchecked option parents', () => {
    global.chrome = makeChromeStorage('Enter');
    const { syncSelectedClass } = require('../src/popup');

    // Mark all as checked first, then sync
    document.querySelectorAll('input[name="lineBreakKey"]').forEach((r) => {
      r.closest('.option').classList.add('selected');
    });

    const radio = document.querySelector('input[value="Enter"]');
    radio.checked = true;
    syncSelectedClass();

    const unchecked = document.querySelector('input[value="Shift+Enter"]');
    expect(unchecked.closest('.option').classList.contains('selected')).toBe(false);
  });

  it('does nothing when .option wrapper is absent', () => {
    // No .option wrappers in this DOM
    document.body.innerHTML = `
      <div id="status"></div>
      <input type="radio" name="lineBreakKey" value="Enter" checked />
    `;
    global.chrome = makeChromeStorage('Enter');
    const { syncSelectedClass } = require('../src/popup');
    expect(() => syncSelectedClass()).not.toThrow();
  });
});

// ── handleChange ──────────────────────────────────────────────────────────

describe('handleChange', () => {
  it('saves the selected key to chrome.storage.sync', () => {
    global.chrome = makeChromeStorage('Enter');
    const { handleChange } = require('../src/popup');

    const fakeRadio = document.querySelector('input[value="Shift+Enter"]');
    fakeRadio.checked = true;

    handleChange({ target: fakeRadio });

    expect(global.chrome.storage.sync.set).toHaveBeenCalledWith(
      { lineBreakKey: 'Shift+Enter' },
      expect.any(Function)
    );
  });

  it('saves Ctrl+Enter correctly', () => {
    global.chrome = makeChromeStorage('Enter');
    const { handleChange } = require('../src/popup');

    const radio = document.querySelector('input[value="Ctrl+Enter"]');
    handleChange({ target: radio });

    expect(global.chrome.storage.sync.set).toHaveBeenCalledWith(
      { lineBreakKey: 'Ctrl+Enter' },
      expect.any(Function)
    );
  });

  it('shows a status message after saving', () => {
    global.chrome = makeChromeStorage('Enter');
    const { handleChange } = require('../src/popup');

    const radio = document.querySelector('input[value="Alt+Enter"]');
    handleChange({ target: radio });

    const statusEl = document.getElementById('status');
    expect(statusEl.classList.contains('show')).toBe(true);
    expect(statusEl.textContent).toBeTruthy();
  });
  it('updates the .selected class on the chosen option', () => {
    global.chrome = makeChromeStorage('Enter');
    const { handleChange } = require('../src/popup');

    const radio = document.querySelector('input[value="Ctrl+Enter"]');
    radio.checked = true;
    handleChange({ target: radio });

    expect(radio.closest('.option').classList.contains('selected')).toBe(true);
    // Other options must NOT be selected
    const others = [...document.querySelectorAll('input[name="lineBreakKey"]')].filter(
      (r) => r.value !== 'Ctrl+Enter'
    );
    others.forEach((r) => {
      expect(r.closest('.option').classList.contains('selected')).toBe(false);
    });
  });
});

// ── showStatus ────────────────────────────────────────────────────────────

describe('showStatus', () => {
  beforeEach(() => {
    global.chrome = makeChromeStorage('Enter');
  });

  it('displays a message and adds the "show" class', () => {
    const { showStatus } = require('../src/popup');

    showStatus('テストメッセージ');

    const statusEl = document.getElementById('status');
    expect(statusEl.textContent).toBe('テストメッセージ');
    expect(statusEl.classList.contains('show')).toBe(true);
  });

  it('removes the "show" class after 2 seconds', () => {
    const { showStatus } = require('../src/popup');

    showStatus('保存しました ✓');

    jest.advanceTimersByTime(2000);

    const statusEl = document.getElementById('status');
    expect(statusEl.classList.contains('show')).toBe(false);
  });

  it('does not remove "show" early when called multiple times rapidly', () => {
    const { showStatus } = require('../src/popup');

    showStatus('1回目');
    jest.advanceTimersByTime(1500); // first timer would fire at 2000, so still visible

    showStatus('2回目'); // second call resets the timer
    jest.advanceTimersByTime(1500); // only 1500 ms into the second 2000 ms window

    const statusEl = document.getElementById('status');
    // The hide timer from the first call must have been cancelled; status is still visible
    expect(statusEl.classList.contains('show')).toBe(true);
    expect(statusEl.textContent).toBe('2回目');
  });

  it('does nothing when the status element is absent', () => {
    document.body.innerHTML = '<div></div>'; // no #status element
    const { showStatus } = require('../src/popup');

    // Should not throw
    expect(() => showStatus('hello')).not.toThrow();
  });
});

// ── isMac / getPlatformKeyLabels ──────────────────────────────────────────

describe('isMac', () => {
  let originalPlatform;

  beforeEach(() => {
    // Capture the original value before any test mutates it.
    originalPlatform = navigator.platform;
  });

  afterEach(() => {
    // Restore the captured original value.
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    // Remove userAgentData override if set.
    delete navigator.userAgentData;
  });

  it('returns true when navigator.userAgentData.platform is "macOS"', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      writable: true,
      configurable: true,
    });
    const { isMac } = require('../src/popup');
    expect(isMac()).toBe(true);
  });

  it('returns false when navigator.userAgentData.platform is "Windows"', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Windows' },
      writable: true,
      configurable: true,
    });
    const { isMac } = require('../src/popup');
    expect(isMac()).toBe(false);
  });

  it('returns false when navigator.userAgentData.platform is "Linux"', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Linux' },
      writable: true,
      configurable: true,
    });
    const { isMac } = require('../src/popup');
    expect(isMac()).toBe(false);
  });

  it('falls back to navigator.platform "MacIntel" when userAgentData is absent', () => {
    global.chrome = makeChromeStorage('Enter');
    delete navigator.userAgentData;
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });
    const { isMac } = require('../src/popup');
    expect(isMac()).toBe(true);
  });

  it('falls back to navigator.platform "Win32" when userAgentData is absent', () => {
    global.chrome = makeChromeStorage('Enter');
    delete navigator.userAgentData;
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });
    const { isMac } = require('../src/popup');
    expect(isMac()).toBe(false);
  });
});

describe('getPlatformKeyLabels', () => {
  afterEach(() => {
    delete navigator.userAgentData;
  });

  it('returns ⌘ labels on Mac', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      writable: true,
      configurable: true,
    });
    const { getPlatformKeyLabels } = require('../src/popup');
    const labels = getPlatformKeyLabels();
    expect(labels.ctrlLabel).toBe('⌘ + Enter');
    expect(labels.altLabel).toBe('⌥ + Enter');
  });

  it('returns Ctrl/Alt labels on Windows', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Windows' },
      writable: true,
      configurable: true,
    });
    const { getPlatformKeyLabels } = require('../src/popup');
    const labels = getPlatformKeyLabels();
    expect(labels.ctrlLabel).toBe('Ctrl + Enter');
    expect(labels.altLabel).toBe('Alt + Enter');
  });

  it('returns Ctrl/Alt labels on Linux', () => {
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Linux' },
      writable: true,
      configurable: true,
    });
    const { getPlatformKeyLabels } = require('../src/popup');
    const labels = getPlatformKeyLabels();
    expect(labels.ctrlLabel).toBe('Ctrl + Enter');
    expect(labels.altLabel).toBe('Alt + Enter');
  });
});

// ── updatePlatformLabels ──────────────────────────────────────────────────

describe('updatePlatformLabels', () => {
  function setupFullDOM() {
    document.body.innerHTML = `
      <div id="status" class="status"></div>
      <input type="radio" name="lineBreakKey" value="Enter" />
      <input type="radio" name="lineBreakKey" value="Shift+Enter" />
      <input type="radio" name="lineBreakKey" value="Ctrl+Enter" />
      <span id="ctrl-enter-label">Ctrl + Enter</span>
      <span id="ctrl-enter-desc">Ctrl+Enterで改行</span>
      <input type="radio" name="lineBreakKey" value="Alt+Enter" />
      <span id="alt-enter-label">Alt + Enter</span>
      <span id="alt-enter-desc">Alt+Enterで改行</span>
    `;
  }

  afterEach(() => {
    delete navigator.userAgentData;
  });

  it('updates labels to ⌘/⌥ on Mac', () => {
    setupFullDOM();
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      writable: true,
      configurable: true,
    });
    const { updatePlatformLabels } = require('../src/popup');
    updatePlatformLabels();

    expect(document.getElementById('ctrl-enter-label').textContent).toBe('⌘ + Enter');
    expect(document.getElementById('alt-enter-label').textContent).toBe('⌥ + Enter');
  });

  it('keeps Ctrl/Alt labels on Windows', () => {
    setupFullDOM();
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Windows' },
      writable: true,
      configurable: true,
    });
    const { updatePlatformLabels } = require('../src/popup');
    updatePlatformLabels();

    expect(document.getElementById('ctrl-enter-label').textContent).toBe('Ctrl + Enter');
    expect(document.getElementById('alt-enter-label').textContent).toBe('Alt + Enter');
  });

  it('keeps Ctrl/Alt labels on Linux', () => {
    setupFullDOM();
    global.chrome = makeChromeStorage('Enter');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Linux' },
      writable: true,
      configurable: true,
    });
    const { updatePlatformLabels } = require('../src/popup');
    updatePlatformLabels();

    expect(document.getElementById('ctrl-enter-label').textContent).toBe('Ctrl + Enter');
    expect(document.getElementById('alt-enter-label').textContent).toBe('Alt + Enter');
  });

  it('does not throw when label elements are absent', () => {
    // minimal DOM with no ctrl/alt label elements
    document.body.innerHTML = '<div id="status"></div>';
    global.chrome = makeChromeStorage('Enter');
    const { updatePlatformLabels } = require('../src/popup');
    expect(() => updatePlatformLabels()).not.toThrow();
  });
});

describe('init', () => {
  it('loads the setting and wires up change listeners', () => {
    global.chrome = makeChromeStorage('Alt+Enter');
    const { init } = require('../src/popup');

    init();

    // loadSetting should have been called (storage.sync.get was invoked)
    expect(global.chrome.storage.sync.get).toHaveBeenCalled();

    // Radio buttons should have change listeners – simulate a change
    const radio = document.querySelector('input[value="Shift+Enter"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));

    // The set should have been called because the change listener was added
    expect(global.chrome.storage.sync.set).toHaveBeenCalledWith(
      { lineBreakKey: 'Shift+Enter' },
      expect.any(Function)
    );
  });
});
