"use strict";

/**
 * Generates images/table.png — a styled HTML table screenshot.
 *
 * The table content is the "Points & Solutions" summary from article.md.
 * Requires puppeteer to be installed (already present as a dep of mermaid-cli).
 *
 * Usage:  node scripts/generate-table-image.js
 */

const puppeteer = require("puppeteer");
const path = require("path");

const ROWS = [
  {
    point: "Google Chatより先にEnterを処理したい",
    solution:
      "キャプチャ位相（<code>addEventListener(..., true)</code>）＋<code>run_at: document_start</code>",
  },
  {
    point: "IMEの変換確定Enterを無視したい",
    solution:
      "<code>event.isComposing</code>チェック（旧ブラウザ向けに<code>keyCode 229</code>も）",
  },
  {
    point: "GmailでChat入力とメール作成を区別したい",
    solution: '祖先要素の<code>data-group-id="space/..."</code>をDOM探索',
  },
  {
    point: "ページリロードなしで設定を反映したい",
    solution:
      "<code>chrome.storage.onChanged</code>でコンテンツスクリプトをリアクティブに更新",
  },
  {
    point: "Chrome APIをモック化してユニットテストしたい",
    solution:
      "CommonJS条件エクスポート＋<code>jest.resetModules()</code>でモジュール状態分離",
  },
];

function buildHtml(rows) {
  const rowsHtml = rows
    .map(
      ({ point, solution }, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="cell-point">${point}</td>
      <td class="cell-solution">${solution}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    font-size: 14px;
    background: #ffffff;
    padding: 16px;
    display: inline-block;
  }
  table {
    border-collapse: collapse;
    width: 760px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
  thead tr {
    background: #DB0C13;
    color: #ffffff;
  }
  th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.02em;
  }
  td {
    padding: 11px 16px;
    vertical-align: top;
    line-height: 1.6;
    border-bottom: 1px solid #e8eaed;
  }
  .row-even { background: #fde8e9; }
  .row-odd  { background: #ffffff; }
  .cell-point {
    width: 42%;
    font-weight: 500;
    color: #202124;
  }
  .cell-solution {
    width: 58%;
    color: #3c4043;
  }
  code {
    font-family: "SFMono-Regular", "Consolas", "Menlo", monospace;
    font-size: 12px;
    background: #fde8e9;
    color: #9e0009;
    padding: 1px 5px;
    border-radius: 4px;
    white-space: nowrap;
  }
</style>
</head>
<body>
<table id="tbl">
  <thead>
    <tr>
      <th>ポイント</th>
      <th>解決策</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>
</body>
</html>`;
}

async function main() {
  const outPath = path.resolve(__dirname, "../images/table.png");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    // Scale up for retina-quality output
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await page.setContent(buildHtml(ROWS), { waitUntil: "networkidle0" });

    const table = await page.$("#tbl");
    if (!table) throw new Error("Table element not found in generated HTML");

    await table.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
