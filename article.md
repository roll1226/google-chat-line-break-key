# Google ChatのEnterキーを乗っ取る — Chrome拡張機能でキーイベント傍受を実装した話

## はじめに

Google Chatを日常的に使っていると、**Enterキーでメッセージが送信されてしまう**ことに困る場面があります。Slackのように「Shift+Enterで送信、Enterで改行」という設定を好む人もいれば、逆に「とにかくEnterだけで改行したい」という人もいます。

Google Chat自体にはキー設定がなく、ブラウザの拡張機能でどうにかするしかありません。そこで「改行キーを自分で選べるChrome拡張機能」を作りました。本記事ではその**実装の核心部分**——キーイベントの傍受、日本語IMEへの対応、Gmail統合Chat環境での判定——を詳しく解説します。

拡張機能はChromeウェブストアに公開済みで、ソースコードもGitHubで公開しています。

---

## 拡張機能の全体設計

まずファイル構成を確認します。

```
manifest.json     ← Chrome拡張機能の設定ファイル
src/
  content.js      ← ページに注入されるスクリプト（キー傍受）
  popup.js        ← ポップアップUIの制御
  popup.html      ← ポップアップのHTML
  popup.css       ← スタイル
icons/            ← 拡張機能アイコン
```

**Manifest V3**形式の`manifest.json`が起点です。重要な設定を抜粋します。

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": [
        "https://chat.google.com/*",
        "https://mail.google.com/*"
      ],
      "js": ["src/content.js"],
      "all_frames": true,
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "src/popup.html"
  }
}
```

注目点が2つあります。

1. **`run_at: "document_start"`** — ページ読み込みの最初期にスクリプトを注入します。Google ChatのJavaScriptが動き出す前にキャプチャハンドラを登録するためです（理由は後述）。
2. **`all_frames: true`** — Google ChatやGmailは内部で複数フレームを利用することがあるため、入力エリアがどのフレームに配置されても対応できるよう、match条件に一致する子フレームにもコンテンツスクリプトを注入します。

データフローはシンプルです。

```
[ポップアップ UI]
      ↓ chrome.storage.sync.set()
[chrome.storage.sync]
      ↓ chrome.storage.onChanged（リアルタイム）
[content.js]
      ↓ execCommand("insertText", false, "\n")
[Google Chat エディタ]
```

ポップアップで選んだキー設定が`chrome.storage.sync`に保存され、コンテンツスクリプトがそれを読んでキーイベントを処理します。ページリロードなしで即座に反映されます。

> 📸 **画像①：ポップアップUIのスクリーンショット**  
> *(Enter / Shift+Enter / Ctrl+Enter / Alt+Enter の4択から選ぶUI)*

---

## 【核心①】キャプチャ位相でのkeydownイベント傍受

### なぜキャプチャ位相が必要か

ブラウザのDOMイベントには伝播フェーズが3つあります。

```
キャプチャ位相（上から下）
  Window
    └─ body
         └─ [target要素]
バブリング位相（下から上）
  [target要素]
    └─ body
         └─ Window
```

通常の`addEventListener("keydown", handler)`はバブリング位相で動作します。現時点のGoogle Chatでは、Enter送信処理が通常のイベント伝播で処理されていることが確認できます。

**問題：** コンテンツスクリプトがバブリングで`event.preventDefault()`を呼んでも、Google ChatのハンドラがDOM内の深い位置に登録されていると、それより先にGoogle Chatが処理してしまいます。

**解決策：** `addEventListener`の第3引数に`true`を渡してキャプチャ位相で登録します。

```js
window.addEventListener("keydown", handleKeyDown, true);
//                                                  ^^^^
//                          true = キャプチャ位相で登録
```

> 📸 **画像②：シーケンス図（イベント伝播の比較）**  
> *通常（バブリング）: Google Chatが先に処理 → 送信されてしまう*  
> *キャプチャ位相: content.jsが先に処理 → stopImmediatePropagation()で止める*

Windowでキャプチャ登録することで、イベント伝播のかなり早い段階でキー入力を傍受できます。さらに`event.stopImmediatePropagation()`を呼ぶことで、同じイベントに対する後続リスナーの実行を抑制し、以降のイベント伝播も停止できます。

```js
function handleKeyDown(event) {
  // ... 各種チェック ...

  if (matchesLineBreakKey(event, lineBreakKey)) {
    event.preventDefault();           // デフォルト動作（送信）をキャンセル
    event.stopImmediatePropagation(); // 後続ハンドラへの伝播を停止
    insertNewline();                  // 代わりに改行を挿入
  }
}

window.addEventListener("keydown", handleKeyDown, true); // キャプチャ位相
```

また`run_at: "document_start"`で最早タイミングに注入することで、Google Chat側のイベントハンドラより先に登録できる可能性が高く、Enter処理を先に傍受しやすくなります。なお、Content ScriptはIsolated World（分離世界）で動作するため、同フェーズの登録順序はブラウザの実装に依存します。

### 改行の挿入方法

キーを止めた後、実際の改行挿入には`document.execCommand()`を使います。

```js
function insertNewline() {
  document.execCommand("insertText", false, "\n");
}
```

`execCommand`は仕様上「非推奨」ですが、Google Chatのような`contenteditable`ベースのリッチテキストエディタでは、`execCommand("insertText")`が`beforeinput`/`input`イベントフローと相性が良く、実用上もっとも安定して動作しました。DOM操作で直接テキストを書き換えてもこれらのイベントは発火しないため、エディタの内部状態がずれ、次回送信時に編集内容が消えることがあります。Chrome系ブラウザでは、`execCommand("insertText")`により`beforeinput`や`input`が発火することが多く、Google Chatのような大規模WebアプリでもUI更新との整合性を保ちやすくなります。

---

## 【核心②】IME（日本語入力）ガードの実装

日本語入力（IME）が関係する厄介なバグがあります。

### 問題：変換確定Enterが改行になる

日本語をIMEで入力している最中に変換確定のEnterを押すと、通常はIMEが変換テキストを確定するだけです。しかしキー傍受の実装が不完全だと、この確定Enterが改行として処理されてしまいます。

### 解決策：isComposingフラグ

ブラウザはIMEがアクティブな間、`KeyboardEvent.isComposing`プロパティを`true`に設定します。これを最初にチェックするだけでほとんどのケースは解決します。

```js
function handleKeyDown(event) {
  // IMEコンポジション中は無視
  if (event.isComposing || event.keyCode === 229) return;

  if (event.key !== "Enter") return;
  // ...
}
```

なぜ`event.keyCode === 229`も合わせてチェックするのか。一部ブラウザやIME環境では`isComposing`が期待通り取得できない場合があるため、フォールバックとして`keyCode === 229`もチェックしています。実質的な影響は少ないですが、**2行追加するだけで安全性が大きく上がる**ので採用しています。

### テストでの確認

```js
it("does NOT fire when IME is composing", () => {
  // isComposing: true のイベントを発火
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    isComposing: true,
  });
  // handleKeyDown が早期リターンするため insertNewline は呼ばれない
  window.dispatchEvent(event);
  expect(document.execCommand).not.toHaveBeenCalled();
});
```

---

## 【核心③】Gmail統合でのdata-group-id判定

この実装が一番面白い部分です。

### 問題：mail.google.comでの誤検知

`manifest.json`の`matches`には`https://mail.google.com/*`も含まれています。Google Workspaceや個人設定によっては、Gmail内でGoogle Chatが統合表示される場合があります。その場合、同じページにGmail作成エリア（メール本文）とGoogle Chatの入力エリアが共存します。

**両方とも`contenteditable`属性を持つDOM要素**なので、単純に「contenteditableかどうか」で判定すると、Gmailでメールを書いているときにも拡張機能が誤作動します。

### 解決策：data-group-idによるDOM探索

Google ChatがGmailに統合されたパネルには、特定のDOM構造があります。Chatのメッセージ入力エリアの祖先要素のどこかに、**`data-group-id="space/XXXXX"`という属性**が付いています（現時点では`space/`形式の値がGoogle Chat関連UIで観測されています）。

```js
function isInsideChatPanel(target) {
  if (!target || typeof target.getAttribute !== "function") return false;

  let el = target;
  while (el && typeof el.getAttribute === "function") {
    const groupId = el.getAttribute("data-group-id");
    if (groupId && groupId.startsWith("space/")) return true;
    el = el.parentElement || null;
  }
  return false;
}
```

`target`（keydownを受け取った要素）から上向きに親要素を辿り、`data-group-id`が`"space/"`で始まる要素が見つかればGoogle Chatの入力エリアだと判定します。

この判定を組み合わせた`isGoogleChatInput()`関数がこちらです。

```js
function isGoogleChatInput(target) {
  if (!isEditableElement(target)) return false;

  const hostname = getHostname();
  if (hostname === "mail.google.com") {
    // Gmail上ではChatパネル内かどうかを追加判定
    return isInsideChatPanel(target);
  }

  // chat.google.com では主要な編集可能要素の多くがChat関連UIであるため追加判定不要
  return true;
}
```

`chat.google.com`ではすべての編集可能要素がChatのものなので判定不要、`mail.google.com`のときだけ`isInsideChatPanel()`を呼びます。

> 📸 **画像③：シーケンス図（data-group-id DOM探索の様子）**  
> *Gmailメール作成エリア（data-group-idなし）→ false*  
> *Google Chat入力エリア（祖先にdata-group-id="space/..."あり）→ true*

### なぜ`data-group-id`が使えるのか


これはGoogle ChatがGmail内でチャットルームを識別するために使っている内部属性です。`space/AAQAJ4YAvpc`のようなGoogle ChatのSpaceIDが入っています。外部APIで公開されている値ではなく、この判定はGoogle Chatの内部DOM属性に依存しているため、将来的なUI変更で無効になる可能性があります。そのため定期的なDOM確認は必要です。

---

## ポップアップUIの実装

### chrome.storage.syncでリアルタイム同期

設定の永続化には`chrome.storage.sync`を使います。Chrome同期が有効な環境では、複数デバイス間で設定が同期される場合があります。

```js
// 設定を保存
function handleChange(event) {
  const selectedKey = sanitizeLineBreakKey(event.target.value);
  chrome.storage.sync.set({ lineBreakKey: selectedKey }, () => {
    showStatus("保存しました ✓");
  });
}

// ページリロードなしでコンテンツスクリプトに反映
function onStorageChanged(changes, area) {
  if (area === "sync" && changes.lineBreakKey) {
    lineBreakKey = sanitizeLineBreakKey(
      changes.lineBreakKey.newValue ?? DEFAULT_LINE_BREAK_KEY
    );
  }
}

chrome.storage.onChanged.addListener(onStorageChanged);
```

`chrome.storage.onChanged`をコンテンツスクリプト側でも監視することで、ポップアップで設定を変えた瞬間にコンテンツスクリプトの動作が変わります。ページリロードは不要です。

### プラットフォーム別ラベル表示

macOSではショートカット操作にCommand（`⌘`）キーが一般的なため、`Ctrl+Enter`設定は`⌘+Enter`として扱っています。また`Alt+Enter`はOptionキー（`⌥`）として表示しています。ポップアップのラベルをOSに応じて動的に変えています。

```js
function getPlatformKeyLabels() {
  if (isMac()) {
    return {
      ctrlLabel: "⌘ + Enter",
      altLabel: "⌥ + Enter",
    };
  }
  return {
    ctrlLabel: "Ctrl + Enter",
    altLabel: "Alt + Enter",
  };
}
```

OS判定は対応ブラウザで`navigator.userAgentData`を優先し、利用できない環境では`navigator.platform`の正規表現マッチにフォールバックします。

> 📸 **画像④：動作デモGIF**  
> *拡張機能なし（Enter送信）→ 拡張機能あり（Enter改行・Shift+Enter送信）*

---

## テスト戦略：Chrome APIをモック化してユニットテスト

Chrome拡張機能のコードをテストするのは一筋縄ではいきません。`chrome.storage`などのAPIはChrome環境にしか存在しないからです。

### CommonJSエクスポートでNode.jsからテスト可能にする

コンテンツスクリプトの末尾に以下のコードを追加します。

```js
if (typeof module !== "undefined") {
  module.exports = {
    matchesLineBreakKey,
    isGoogleChatInput,
    isSuggestionDropdownOpen,
    // ...
  };
} else {
  // 実際のChrome環境ではinitを呼ぶ
  if (typeof chrome !== "undefined" && chrome.storage) {
    init();
  }
}
```

`module`が定義されている（=Node.js/Jest環境）ときは関数をエクスポートし、そうでない（=ブラウザ）ときは`init()`を呼ぶ。CommonJSベースのテスト環境では、同一ファイルをブラウザ用コードとテストコードで共有できます。

### jest.resetModules()でモジュール状態を分離

`lineBreakKey`はモジュールスコープの変数です。テスト間でこの状態が漏れないよう、各テスト前に`jest.resetModules()`でモジュールキャッシュをクリアします。

```js
beforeEach(() => {
  // chrome APIのモックを設定
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn((_defaults, cb) => cb({ lineBreakKey: "Enter" })),
      },
      onChanged: { addListener: jest.fn() },
    },
  };

  // モジュールを再ロードして lineBreakKey をリセット
  jest.resetModules();
});

function loadModule() {
  return require("../src/content");
}
```

各テストで`loadModule()`を呼ぶと、その時点のグローバルモック（`global.chrome`）を参照した新鮮なモジュールインスタンスが得られます。

### macOS固有テストの書き方

`Ctrl+Enter`はmacOSでは`⌘+Enter`でも動作しますが、Windowsでは動作しないことをテストします。

```js
it("matches Meta+Enter on macOS", () => {
  Object.defineProperty(navigator, "userAgentData", {
    value: { platform: "macOS" },
    configurable: true,
  });
  jest.resetModules();
  const { matchesLineBreakKey } = loadModule();

  const event = { key: "Enter", metaKey: true, ctrlKey: false,
                  shiftKey: false, altKey: false };
  expect(matchesLineBreakKey(event, "Ctrl+Enter")).toBe(true);
});

it("does NOT match Meta+Enter on Windows", () => {
  Object.defineProperty(navigator, "userAgentData", {
    value: { platform: "Windows" },
    configurable: true,
  });
  jest.resetModules();
  const { matchesLineBreakKey } = loadModule();

  const event = { key: "Enter", metaKey: true, ctrlKey: false,
                  shiftKey: false, altKey: false };
  expect(matchesLineBreakKey(event, "Ctrl+Enter")).toBe(false);
});
```

`navigator.userAgentData`を`Object.defineProperty`で上書きすることで、OS判定をテスト内で制御できます。

---

## リリース自動化：GitHub Actions

`v*`タグをpushするだけでChrome拡張機能のzipが生成されGitHub Releaseが作られます。

```yaml
# .github/workflows/release.yml（概略）
on:
  push:
    tags: ["v*"]

jobs:
  release:
    steps:
      - run: npm ci
      - run: npm test
      - run: npm run generate-icons
      - run: zip -r extension.zip manifest.json src/ icons/
      - uses: softprops/action-gh-release@v1
        with:
          files: extension.zip
```

`manifest.json + src/ + icons/`の3点セットをzipにするだけで、Chrome Web Storeに提出可能な基本パッケージ形式になります。

---

## まとめ

今回の実装で特に重要だったポイントを振り返ります。

| ポイント | 解決策 |
|----------|--------|
| Google Chatより先にEnterを処理したい | キャプチャ位相（`addEventListener(..., true)`）＋`run_at: document_start` |
| IMEの変換確定Enterを無視したい | `event.isComposing`チェック（旧ブラウザ向けに`keyCode 229`も） |
| GmailでChat入力とメール作成を区別したい | 祖先要素の`data-group-id="space/..."`をDOM探索 |
| ページリロードなしで設定を反映したい | `chrome.storage.onChanged`でコンテンツスクリプトをリアクティブに更新 |
| Chrome APIをモック化してユニットテストしたい | CommonJS条件エクスポート＋`jest.resetModules()`でモジュール状態分離 |

細かい部分まで含めると、「ただEnterキーを止めて改行する」だけのシンプルな拡張機能でも、日本語入力・マルチページ対応・クロスプラットフォーム・テスタビリティと、考えることは多いことがわかりました。

ソースコード全体はGitHubで公開していますので、拡張機能開発の参考にどうぞ。
