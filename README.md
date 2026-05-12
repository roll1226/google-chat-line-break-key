# google-chat-line-break-key

Google Chatの改行キーを変更できるChrome拡張機能です。

[![Test](https://github.com/roll1226/googo-chat-line-break-key/actions/workflows/test.yml/badge.svg)](https://github.com/roll1226/googo-chat-line-break-key/actions/workflows/test.yml)

## 機能

- Google Chat のテキスト入力エリアで改行キーの組み合わせを変更できます
- 拡張機能のポップアップから改行キーを選択できます
- 選択できるキーの組み合わせ
  - **Enter**（拡張機能デフォルト）
  - **Shift + Enter**（Google Chat デフォルト）
  - **Ctrl + Enter**
  - **Alt + Enter**
- ライトモード・ダークモード対応
- 日本語入力（IME）中は誤動作しません（`isComposing` による制御）

## インストール

### リリースからインストール（推奨）

1. [Releases](../../releases) ページから最新バージョンの ZIP をダウンロードします
2. ZIP を展開します
3. Chrome で `chrome://extensions` を開きます
4. 右上の「デベロッパーモード」を有効にします
5. 「パッケージ化されていない拡張機能を読み込む」をクリックし、展開したフォルダを選択します

### 開発用インストール

```bash
# アイコンを生成する（初回のみ）
npm install
npm run generate-icons

# Chrome で chrome://extensions を開き、
# 「パッケージ化されていない拡張機能を読み込む」でリポジトリルートを選択
```

## 開発

### 必要なもの

- Node.js 20 以上
- npm

### セットアップ

```bash
npm install
```

### テストの実行

```bash
npm test
```

### カバレッジレポートの生成

```bash
npm run test:coverage
```

### アイコンの生成

```bash
npm run generate-icons
```

## プロジェクト構成

```
.
├── manifest.json          # Chrome 拡張機能マニフェスト (MV3)
├── src/
│   ├── content.js         # コンテントスクリプト（キーイベントの制御）
│   ├── popup.html         # ポップアップ UI
│   ├── popup.js           # ポップアップのロジック
│   └── popup.css          # ポップアップのスタイル（ライト/ダークモード）
├── icons/                 # 拡張機能アイコン（generate-icons.js で生成）
├── scripts/
│   └── generate-icons.js  # アイコン生成スクリプト（外部依存なし）
├── tests/
│   ├── content.test.js    # content.js のユニットテスト
│   └── popup.test.js      # popup.js のユニットテスト
└── .github/workflows/
    ├── test.yml           # CI：push 時にテストを実行
    └── release.yml        # CD：タグ push 時にリリースを作成
```

## ライセンス

MIT
