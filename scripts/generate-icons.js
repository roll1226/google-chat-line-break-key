'use strict';

/**
 * Minimal PNG icon generator using only Node.js built-ins (no npm deps).
 *
 * Creates solid-color square PNG images for each required icon size.
 * The icons use Google Blue (#1a73e8) as the background and a white
 * "line return" symbol drawn with solid pixels.
 *
 * Usage:  node scripts/generate-icons.js
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC-32 ─────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG helpers ────────────────────────────────────────────────────────────

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  return Buffer.concat([u32be(data.length), t, data, u32be(crc32(Buffer.concat([t, data])))]);
}

// ── Pixel drawing helpers ──────────────────────────────────────────────────

/**
 * Creates an RGBA pixel buffer (4 bytes per pixel) initialized to the given
 * background color.
 * @param {number} size  Width/height in pixels.
 * @param {number[]} bg  [r, g, b, a] background color.
 * @returns {Uint8Array}
 */
function makeCanvas(size, bg) {
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = bg[3];
  }
  return pixels;
}

function setPixel(pixels, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

function drawRect(pixels, size, x, y, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(pixels, size, x + dx, y + dy, r, g, b);
    }
  }
}

// ── Icon drawing ───────────────────────────────────────────────────────────

/**
 * Draws a simple "line-return / enter key" symbol scaled to the icon size.
 * Symbol:  ─┐       (horizontal bar, then turn down and left with an arrow)
 *            │
 *           ←─
 *
 * @param {Uint8Array} pixels  RGBA flat array.
 * @param {number} size        Icon size in pixels (16 | 48 | 128).
 */
function drawSymbol(pixels, size, r, g, b) {
  const s = size / 16; // scale factor (1 for 16px, 3 for 48px, 8 for 128px)

  const thick = Math.max(1, Math.round(s)); // line thickness

  // Horizontal bar at the top-right
  const hBarY = Math.round(5 * s);
  const hBarX1 = Math.round(5 * s);
  const hBarX2 = Math.round(11 * s);
  drawRect(pixels, size, hBarX1, hBarY, hBarX2 - hBarX1, thick, r, g, b);

  // Vertical bar on the right going down
  const vBarX = hBarX2 - thick;
  const vBarY1 = hBarY;
  const vBarY2 = Math.round(11 * s);
  drawRect(pixels, size, vBarX, vBarY1, thick, vBarY2 - vBarY1 + thick, r, g, b);

  // Horizontal bar at the bottom (left-pointing)
  const hBar2Y = vBarY2;
  const hBar2X1 = Math.round(4 * s);
  const hBar2X2 = vBarX;
  drawRect(pixels, size, hBar2X1, hBar2Y, hBar2X2 - hBar2X1, thick, r, g, b);

  // Arrow head (left-pointing triangle)
  const arrowTip = Math.round(3 * s);
  const arrowMid = hBar2Y + Math.floor(thick / 2);
  const arrowSize = Math.max(2, Math.round(2.5 * s));
  for (let i = 0; i < arrowSize; i++) {
    drawRect(pixels, size, arrowTip + i, arrowMid - i, thick, i * 2 + thick, r, g, b);
  }
}

// ── PNG encoder ────────────────────────────────────────────────────────────

function encodePNG(pixels, size) {
  // Convert RGBA to RGB rows with filter byte
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      row[1 + x * 3] = pixels[src];
      row[2 + x * 3] = pixels[src + 1];
      row[3 + x * 3] = pixels[src + 2];
    }
    rows.push(row);
  }

  const rawData = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk(
    'IHDR',
    Buffer.concat([u32be(size), u32be(size), Buffer.from([8, 2, 0, 0, 0])])
  );
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ── Main ───────────────────────────────────────────────────────────────────

const SIZES = [16, 48, 128];

// Google Blue background (#1a73e8) with white symbol
const BG = [26, 115, 232, 255];
const FG = [255, 255, 255];

const iconsDir = path.resolve(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

for (const size of SIZES) {
  const pixels = makeCanvas(size, BG);
  drawSymbol(pixels, size, FG[0], FG[1], FG[2]);
  const png = encodePNG(pixels, size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
