"use strict";

/**
 * Generates images/thumbnail.png — an OGP-sized article thumbnail (1200×630).
 *
 * Design: Actual popup screenshot (images/popup.png) on a dark gradient background.
 * Requires puppeteer to be installed (already present as a dep of mermaid-cli).
 *
 * Usage:  node scripts/generate-thumbnail.js
 */

const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

function buildHtml(popupBase64) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    width: 1200px;
    height: 630px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%);
    font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  /* Background grid */
  .grid {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  /* Accent glow circles */
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
  }
  .glow-red {
    width: 400px; height: 400px;
    background: rgba(219, 12, 19, 0.18);
    top: -80px; left: -80px;
  }
  .glow-blue {
    width: 360px; height: 360px;
    background: rgba(66, 133, 244, 0.14);
    bottom: -60px; right: 260px;
  }

  /* ---------- Layout ---------- */
  .layout {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0 64px;
    gap: 48px;
    z-index: 1;
  }

  /* ---------- Left: text ---------- */
  .left {
    flex: 1;
    min-width: 0;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(66, 133, 244, 0.18);
    border: 1px solid rgba(66, 133, 244, 0.45);
    color: #7baaf7;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 22px;
    letter-spacing: 0.06em;
  }

  .badge-dot {
    width: 7px; height: 7px;
    background: #4285f4;
    border-radius: 50%;
  }

  .title {
    font-size: 36px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.35;
    margin-bottom: 18px;
    letter-spacing: -0.01em;
  }

  .title .highlight {
    color: #ff4444;
    text-shadow: 0 0 24px rgba(219,12,19,0.5);
  }

  .subtitle {
    font-size: 17px;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1.65;
    margin-bottom: 30px;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.65);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-family: "SFMono-Regular", "Consolas", "Menlo", monospace;
  }

  /* ---------- Right: popup image ---------- */
  .right {
    flex-shrink: 0;
    width: 280px;
    display: flex;
    align-items: center;
  }

  .popup-img {
    width: 100%;
    border-radius: 12px;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.65),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    display: block;
  }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="glow glow-red"></div>
  <div class="glow glow-blue"></div>

  <div class="layout">
    <!-- Left: article headline -->
    <div class="left">
      <div class="badge">
        <div class="badge-dot"></div>
        Chrome Extension
      </div>
      <div class="title">
        Google Chatで起こる<br>
        改行と送信の<span class="highlight">ストレス解消</span>を<br>
        目指した拡張機能開発
      </div>
      <div class="tags">
        <span class="tag">Manifest V3</span>
        <span class="tag">keydown capture</span>
        <span class="tag">IME対応</span>
        <span class="tag">Gmail統合</span>
        <span class="tag">execCommand</span>
      </div>
    </div>

    <!-- Right: popup screenshot -->
    <div class="right">
      <img class="popup-img" src="data:image/png;base64,${popupBase64}" alt="拡張機能のポップアップ">
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const popupPath = path.resolve(__dirname, "../images/popup.png");
  const popupBase64 = fs.readFileSync(popupPath).toString("base64");

  const outPath = path.resolve(__dirname, "../images/thumbnail.png");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
    await page.setContent(buildHtml(popupBase64), {
      waitUntil: "networkidle0",
    });

    const body = await page.$("body");
    if (!body) throw new Error("body element not found in generated HTML");

    await body.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
