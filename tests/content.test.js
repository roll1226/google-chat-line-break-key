"use strict";

/**
 * Unit tests for src/content.js
 *
 * The content script exports pure helper functions via CommonJS when running
 * outside the browser (i.e. in Jest), which lets us test the logic directly
 * without a real Chrome environment.
 */

// ── Chrome API mock ────────────────────────────────────────────────────────

beforeEach(() => {
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn((_defaults, cb) => cb({ lineBreakKey: "Enter" })),
        set: jest.fn((_data, cb) => cb && cb()),
      },
      onChanged: {
        addListener: jest.fn(),
      },
    },
  };

  // Reset the module so each test starts with a fresh lineBreakKey state.
  jest.resetModules();
});

afterEach(() => {
  delete global.chrome;
  jest.restoreAllMocks();
});

// ── Helper to get a fresh module copy ─────────────────────────────────────

function loadModule() {
  return require("../src/content");
}

// ── matchesLineBreakKey ────────────────────────────────────────────────────

describe("matchesLineBreakKey", () => {
  let matchesLineBreakKey;

  beforeEach(() => {
    ({ matchesLineBreakKey } = loadModule());
  });

  /** Builds a minimal fake KeyboardEvent-like object */
  function key(opts) {
    return {
      key: "Enter",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...opts,
    };
  }

  describe("Enter", () => {
    it("matches plain Enter", () => {
      expect(matchesLineBreakKey(key({}), "Enter")).toBe(true);
    });

    it("does NOT match Shift+Enter", () => {
      expect(matchesLineBreakKey(key({ shiftKey: true }), "Enter")).toBe(false);
    });

    it("does NOT match Ctrl+Enter", () => {
      expect(matchesLineBreakKey(key({ ctrlKey: true }), "Enter")).toBe(false);
    });

    it("does NOT match Alt+Enter", () => {
      expect(matchesLineBreakKey(key({ altKey: true }), "Enter")).toBe(false);
    });
  });

  describe("Shift+Enter", () => {
    it("matches Shift+Enter", () => {
      expect(matchesLineBreakKey(key({ shiftKey: true }), "Shift+Enter")).toBe(
        true,
      );
    });

    it("does NOT match plain Enter", () => {
      expect(matchesLineBreakKey(key({}), "Shift+Enter")).toBe(false);
    });

    it("does NOT match Ctrl+Shift+Enter", () => {
      expect(
        matchesLineBreakKey(
          key({ shiftKey: true, ctrlKey: true }),
          "Shift+Enter",
        ),
      ).toBe(false);
    });
  });

  describe("Ctrl+Enter", () => {
    it("matches Ctrl+Enter", () => {
      expect(matchesLineBreakKey(key({ ctrlKey: true }), "Ctrl+Enter")).toBe(
        true,
      );
    });

    it("matches Meta+Enter on macOS (⌘ Command key)", () => {
      Object.defineProperty(navigator, "userAgentData", {
        value: { platform: "macOS" },
        writable: true,
        configurable: true,
      });
      jest.resetModules();
      ({ matchesLineBreakKey } = loadModule());
      expect(matchesLineBreakKey(key({ metaKey: true }), "Ctrl+Enter")).toBe(
        true,
      );
      delete navigator.userAgentData;
    });

    it("does NOT match Meta+Enter on Windows (Win/Super key ≠ Ctrl)", () => {
      Object.defineProperty(navigator, "userAgentData", {
        value: { platform: "Windows" },
        writable: true,
        configurable: true,
      });
      jest.resetModules();
      ({ matchesLineBreakKey } = loadModule());
      expect(matchesLineBreakKey(key({ metaKey: true }), "Ctrl+Enter")).toBe(
        false,
      );
      delete navigator.userAgentData;
    });

    it("does NOT match plain Enter", () => {
      expect(matchesLineBreakKey(key({}), "Ctrl+Enter")).toBe(false);
    });

    it("does NOT match Ctrl+Shift+Enter", () => {
      expect(
        matchesLineBreakKey(
          key({ ctrlKey: true, shiftKey: true }),
          "Ctrl+Enter",
        ),
      ).toBe(false);
    });

    it("does NOT match Ctrl+⌘+Enter (both modifiers at once)", () => {
      expect(
        matchesLineBreakKey(
          key({ ctrlKey: true, metaKey: true }),
          "Ctrl+Enter",
        ),
      ).toBe(false);
    });
  });

  describe("Alt+Enter", () => {
    it("matches Alt+Enter", () => {
      expect(matchesLineBreakKey(key({ altKey: true }), "Alt+Enter")).toBe(
        true,
      );
    });

    it("does NOT match plain Enter", () => {
      expect(matchesLineBreakKey(key({}), "Alt+Enter")).toBe(false);
    });

    it("does NOT match Alt+Enter when Meta is also pressed (⌘+⌥+Enter on Mac)", () => {
      expect(
        matchesLineBreakKey(key({ altKey: true, metaKey: true }), "Alt+Enter"),
      ).toBe(false);
    });
  });

  describe("non-Enter key", () => {
    it("returns false when key is not Enter", () => {
      expect(
        matchesLineBreakKey(
          {
            key: "a",
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
          },
          "Enter",
        ),
      ).toBe(false);
    });
  });

  describe("unknown key combo string", () => {
    it("returns false for unrecognised combo", () => {
      expect(
        matchesLineBreakKey(
          {
            key: "Enter",
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
          },
          "Win+Enter",
        ),
      ).toBe(false);
    });
  });
});

// ── isGoogleChatInput ──────────────────────────────────────────────────────

describe("isGoogleChatInput", () => {
  let isGoogleChatInput;

  beforeEach(() => {
    ({ isGoogleChatInput } = loadModule());
  });

  it("returns true for a <textarea>", () => {
    const el = document.createElement("textarea");
    expect(isGoogleChatInput(el)).toBe(true);
  });

  it("returns true for a contenteditable div", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(isGoogleChatInput(el)).toBe(true);
  });

  it('returns true for contenteditable="" (empty string means editable)', () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "");
    expect(isGoogleChatInput(el)).toBe(true);
  });

  it('returns false for contenteditable="false"', () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "false");
    expect(isGoogleChatInput(el)).toBe(false);
  });

  it('returns true for a contenteditable="plaintext-only" div', () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "plaintext-only");
    expect(isGoogleChatInput(el)).toBe(true);
  });

  it('returns true for role="textbox"', () => {
    const el = document.createElement("div");
    el.setAttribute("role", "textbox");
    expect(isGoogleChatInput(el)).toBe(true);
  });

  it("returns false for a plain <div>", () => {
    const el = document.createElement("div");
    expect(isGoogleChatInput(el)).toBe(false);
  });

  it("returns false for a <button>", () => {
    const el = document.createElement("button");
    expect(isGoogleChatInput(el)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isGoogleChatInput(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isGoogleChatInput(undefined)).toBe(false);
  });

  it("returns true for an element that inherits contenteditable from a parent", () => {
    const parent = document.createElement("div");
    parent.setAttribute("contenteditable", "true");
    const child = document.createElement("div");
    parent.appendChild(child);
    // child.getAttribute('contenteditable') is null, but child.isContentEditable is true
    expect(isGoogleChatInput(child)).toBe(true);
  });

  describe("on mail.google.com (Gmail)", () => {
    let origLocation;

    beforeEach(() => {
      origLocation = window.location;
      delete window.location;
      window.location = {
        hostname: "mail.google.com",
        href: "https://mail.google.com/mail/u/0/#chat/abc",
      };
      jest.resetModules();
      ({ isGoogleChatInput } = loadModule());
    });

    afterEach(() => {
      window.location = origLocation;
    });

    it('returns true for a contenteditable inside a Chat panel (data-group-id="space/...")', () => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-group-id", "space/AAQAJ4YAvpc");
      const el = document.createElement("div");
      el.setAttribute("contenteditable", "true");
      wrapper.appendChild(el);
      expect(isGoogleChatInput(el)).toBe(true);
    });

    it("returns false for a contenteditable outside a Chat panel (no data-group-id ancestor)", () => {
      const el = document.createElement("div");
      el.setAttribute("contenteditable", "true");
      expect(isGoogleChatInput(el)).toBe(false);
    });

    it("returns false for a contenteditable with non-space data-group-id ancestor", () => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-group-id", "thread/12345");
      const el = document.createElement("div");
      el.setAttribute("contenteditable", "true");
      wrapper.appendChild(el);
      expect(isGoogleChatInput(el)).toBe(false);
    });

    it("returns false for a plain div inside a Chat panel", () => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-group-id", "space/AAQAJ4YAvpc");
      const el = document.createElement("div");
      wrapper.appendChild(el);
      expect(isGoogleChatInput(el)).toBe(false);
    });

    it("returns true for a textarea inside a Chat panel", () => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-group-id", "space/AAQAJ4YAvpc");
      const el = document.createElement("textarea");
      wrapper.appendChild(el);
      expect(isGoogleChatInput(el)).toBe(true);
    });
  });
});

// ── isInsideChatPanel ──────────────────────────────────────────────────────

describe("isInsideChatPanel", () => {
  let isInsideChatPanel;

  beforeEach(() => {
    ({ isInsideChatPanel } = loadModule());
  });

  it('returns true when ancestor has data-group-id starting with "space/"', () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-group-id", "space/AAQAJ4YAvpc");
    const el = document.createElement("div");
    wrapper.appendChild(el);
    expect(isInsideChatPanel(el)).toBe(true);
  });

  it('returns true when the element itself has data-group-id starting with "space/"', () => {
    const el = document.createElement("div");
    el.setAttribute("data-group-id", "space/ABC123");
    expect(isInsideChatPanel(el)).toBe(true);
  });

  it("returns true with deeply nested element", () => {
    const root = document.createElement("div");
    root.setAttribute("data-group-id", "space/XYZ");
    const mid = document.createElement("div");
    root.appendChild(mid);
    const el = document.createElement("div");
    mid.appendChild(el);
    expect(isInsideChatPanel(el)).toBe(true);
  });

  it("returns false when no ancestor has data-group-id", () => {
    const wrapper = document.createElement("div");
    const el = document.createElement("div");
    wrapper.appendChild(el);
    expect(isInsideChatPanel(el)).toBe(false);
  });

  it('returns false when data-group-id does not start with "space/"', () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-group-id", "thread/12345");
    const el = document.createElement("div");
    wrapper.appendChild(el);
    expect(isInsideChatPanel(el)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isInsideChatPanel(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isInsideChatPanel(undefined)).toBe(false);
  });
});

// ── isSuggestionDropdownOpen ───────────────────────────────────────────────

describe("isSuggestionDropdownOpen", () => {
  let isSuggestionDropdownOpen;

  beforeEach(() => {
    ({ isSuggestionDropdownOpen } = loadModule());
  });

  it('returns true when aria-expanded is "true"', () => {
    const el = document.createElement("div");
    el.setAttribute("aria-expanded", "true");
    expect(isSuggestionDropdownOpen(el)).toBe(true);
  });

  it('returns false when aria-expanded is "false"', () => {
    const el = document.createElement("div");
    el.setAttribute("aria-expanded", "false");
    expect(isSuggestionDropdownOpen(el)).toBe(false);
  });

  it("returns false when aria-expanded is absent", () => {
    const el = document.createElement("div");
    expect(isSuggestionDropdownOpen(el)).toBe(false);
  });

  it("returns true when aria-activedescendant is set (dropdown option is highlighted)", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-activedescendant", "option-1");
    expect(isSuggestionDropdownOpen(el)).toBe(true);
  });

  it("returns false when aria-activedescendant is empty string", () => {
    const el = document.createElement("div");
    el.setAttribute("aria-activedescendant", "");
    expect(isSuggestionDropdownOpen(el)).toBe(false);
  });

  it('returns true when a [role="listbox"] exists in the document (portal-rendered dropdown)', () => {
    const listbox = document.createElement("ul");
    listbox.setAttribute("role", "listbox");
    document.body.appendChild(listbox);
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    try {
      expect(isSuggestionDropdownOpen(el)).toBe(true);
    } finally {
      document.body.removeChild(listbox);
    }
  });

  it('returns false when no [role="listbox"] exists in the document', () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(isSuggestionDropdownOpen(el)).toBe(false);
  });

  it('returns true when aria-expanded="true" is on a parent element', () => {
    const parent = document.createElement("div");
    parent.setAttribute("aria-expanded", "true");
    const child = document.createElement("div");
    child.setAttribute("contenteditable", "true");
    parent.appendChild(child);
    expect(isSuggestionDropdownOpen(child)).toBe(true);
  });

  it('returns false when aria-expanded="true" is NOT in any ancestor', () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    child.setAttribute("contenteditable", "true");
    parent.appendChild(child);
    expect(isSuggestionDropdownOpen(child)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSuggestionDropdownOpen(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSuggestionDropdownOpen(undefined)).toBe(false);
  });
});

// ── handleKeyDown ──────────────────────────────────────────────────────────

describe("handleKeyDown", () => {
  let content;

  beforeEach(() => {
    content = loadModule();
    // Ensure execCommand is available in jsdom
    document.execCommand = jest.fn(() => true);
  });

  function makeEvent(opts) {
    return {
      key: "Enter",
      keyCode: 13,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false,
      target: (() => {
        const el = document.createElement("div");
        el.setAttribute("contenteditable", "true");
        return el;
      })(),
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      stopImmediatePropagation: jest.fn(),
      ...opts,
    };
  }

  it("calls preventDefault and stopImmediatePropagation when key matches", () => {
    content.setLineBreakKey("Enter");
    const event = makeEvent({});
    content.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it("calls execCommand to insert newline when key matches", () => {
    content.setLineBreakKey("Enter");
    const event = makeEvent({});
    content.handleKeyDown(event);
    expect(document.execCommand).toHaveBeenCalledWith(
      "insertText",
      false,
      "\n",
    );
  });

  it("does NOT intercept when the combo does not match", () => {
    content.setLineBreakKey("Shift+Enter"); // configured to Shift+Enter
    const event = makeEvent({ shiftKey: false }); // plain Enter pressed
    content.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT intercept during IME composition (isComposing = true)", () => {
    content.setLineBreakKey("Enter");
    const event = makeEvent({ isComposing: true });
    content.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT intercept when keyCode is 229 (legacy IME indicator)", () => {
    content.setLineBreakKey("Enter");
    const event = makeEvent({ keyCode: 229 });
    content.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT intercept non-Enter keys", () => {
    content.setLineBreakKey("Enter");
    const event = makeEvent({ key: "a" });
    content.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("does NOT intercept events on non-input elements", () => {
    content.setLineBreakKey("Enter");
    const el = document.createElement("div"); // no contenteditable
    const event = makeEvent({ target: el });
    content.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("intercepts Shift+Enter when configured as line break key", () => {
    content.setLineBreakKey("Shift+Enter");
    const event = makeEvent({ shiftKey: true });
    content.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("intercepts Ctrl+Enter when configured as line break key", () => {
    content.setLineBreakKey("Ctrl+Enter");
    const event = makeEvent({ ctrlKey: true });
    content.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("intercepts Alt+Enter when configured as line break key", () => {
    content.setLineBreakKey("Alt+Enter");
    const event = makeEvent({ altKey: true });
    content.handleKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

// ── onStorageChanged ───────────────────────────────────────────────────────

describe("onStorageChanged", () => {
  let content;

  beforeEach(() => {
    content = loadModule();
  });

  it("updates lineBreakKey when storage sync changes", () => {
    content.onStorageChanged(
      { lineBreakKey: { newValue: "Ctrl+Enter" } },
      "sync",
    );
    expect(content.getLineBreakKey()).toBe("Ctrl+Enter");
  });

  it("falls back to DEFAULT when newValue is undefined (key deleted)", () => {
    content.setLineBreakKey("Shift+Enter");
    content.onStorageChanged({ lineBreakKey: { newValue: undefined } }, "sync");
    expect(content.getLineBreakKey()).toBe(content.DEFAULT_LINE_BREAK_KEY);
  });

  it("ignores changes from non-sync storage areas", () => {
    content.setLineBreakKey("Enter");
    content.onStorageChanged(
      { lineBreakKey: { newValue: "Alt+Enter" } },
      "local",
    );
    expect(content.getLineBreakKey()).toBe("Enter");
  });

  it("ignores changes that do not affect lineBreakKey", () => {
    content.setLineBreakKey("Enter");
    content.onStorageChanged({ someOtherKey: { newValue: "foo" } }, "sync");
    expect(content.getLineBreakKey()).toBe("Enter");
  });

  it("falls back to DEFAULT when newValue is an invalid string", () => {
    content.setLineBreakKey("Enter");
    content.onStorageChanged(
      { lineBreakKey: { newValue: "INVALID_KEY" } },
      "sync",
    );
    expect(content.getLineBreakKey()).toBe(content.DEFAULT_LINE_BREAK_KEY);
  });
});

// ── sanitizeLineBreakKey ───────────────────────────────────────────────────

describe("sanitizeLineBreakKey", () => {
  let content;

  beforeEach(() => {
    content = loadModule();
  });

  it("returns the value unchanged for each valid key", () => {
    content.VALID_LINE_BREAK_KEYS.forEach((key) => {
      expect(content.sanitizeLineBreakKey(key)).toBe(key);
    });
  });

  it("returns the default for an unrecognised string", () => {
    expect(content.sanitizeLineBreakKey("Win+Enter")).toBe(
      content.DEFAULT_LINE_BREAK_KEY,
    );
  });

  it("returns the default for an empty string", () => {
    expect(content.sanitizeLineBreakKey("")).toBe(
      content.DEFAULT_LINE_BREAK_KEY,
    );
  });

  it("returns the default for null", () => {
    expect(content.sanitizeLineBreakKey(null)).toBe(
      content.DEFAULT_LINE_BREAK_KEY,
    );
  });

  it("returns the default for undefined", () => {
    expect(content.sanitizeLineBreakKey(undefined)).toBe(
      content.DEFAULT_LINE_BREAK_KEY,
    );
  });

  it("returns the default for a number", () => {
    expect(content.sanitizeLineBreakKey(42)).toBe(
      content.DEFAULT_LINE_BREAK_KEY,
    );
  });
});
