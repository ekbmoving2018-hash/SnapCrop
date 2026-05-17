// Pure Node.js PNG icon generator — no npm dependencies required
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'icons');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// ── PNG encoder ──────────────────────────────────────────────────────────────

function encodePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row by row

  function crc32(buf) {
    const table = crc32.table || (crc32.table = buildCrcTable());
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function buildCrcTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crcInput = Buffer.concat([typeBytes, data]);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // RGB (no alpha — we handle it in raw rows below)
  ihdr[9]  = 6;  // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // IDAT: filter byte 0 (None) before each row
  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter type None
    pixels.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Icon painter ─────────────────────────────────────────────────────────────

function paintIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    pixels[idx]     = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  }

  function blendPixel(x, y, r, g, b, alpha) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    const a = alpha / 255;
    const ia = 1 - a;
    pixels[idx]     = Math.round(pixels[idx]     * ia + r * a);
    pixels[idx + 1] = Math.round(pixels[idx + 1] * ia + g * a);
    pixels[idx + 2] = Math.round(pixels[idx + 2] * ia + b * a);
    pixels[idx + 3] = Math.round(Math.min(255, pixels[idx + 3] + alpha));
  }

  // Fill background with blue #2563EB
  const BG = [0x25, 0x63, 0xEB];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = size * 0.12;
      // Rounded rect mask
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r + 0.5) {
        const alpha = dist > r - 0.5 ? Math.round((r + 0.5 - dist) * 255) : 255;
        blendPixel(x, y, BG[0], BG[1], BG[2], alpha);
      }
    }
  }

  // Draw thick white line between two points (Bresenham + width)
  function drawLine(x1, y1, x2, y2, width) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len; // normal
    const steps = Math.ceil(len * 2);
    const hw = width / 2;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      for (let w = -hw - 1; w <= hw + 1; w++) {
        const px = Math.round(cx + nx * w);
        const py = Math.round(cy + ny * w);
        const dist = Math.abs(w);
        if (dist <= hw) {
          const alpha = dist > hw - 0.5 ? Math.round((hw + 0.5 - dist) * 255) : 255;
          blendPixel(px, py, 255, 255, 255, alpha);
        }
      }
    }
  }

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const arm = size * 0.27;
  const gap = size * 0.09;
  const lw  = Math.max(1.2, size * 0.065);
  const bS  = size * 0.2;
  const bO  = size * 0.13;
  const bLw = Math.max(1.2, size * 0.07);

  // Crosshair
  drawLine(cx - arm, cy, cx - gap, cy, lw);
  drawLine(cx + gap, cy, cx + arm, cy, lw);
  drawLine(cx, cy - arm, cx, cy - gap, lw);
  drawLine(cx, cy + gap, cx, cy + arm, lw);

  // Corner brackets
  const corners = [
    [[bO, bO + bS], [bO, bO], [bO + bS, bO]],
    [[size - 1 - bO - bS, bO], [size - 1 - bO, bO], [size - 1 - bO, bO + bS]],
    [[size - 1 - bO, size - 1 - bO - bS], [size - 1 - bO, size - 1 - bO], [size - 1 - bO - bS, size - 1 - bO]],
    [[bO + bS, size - 1 - bO], [bO, size - 1 - bO], [bO, size - 1 - bO - bS]]
  ];
  corners.forEach(pts => {
    drawLine(pts[0][0], pts[0][1], pts[1][0], pts[1][1], bLw);
    drawLine(pts[1][0], pts[1][1], pts[2][0], pts[2][1], bLw);
  });

  return pixels;
}

// ── Generate ─────────────────────────────────────────────────────────────────

SIZES.forEach(size => {
  const pixels = paintIcon(size);
  const png    = encodePNG(size, size, pixels);
  const out    = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ icon${size}.png`);
});

console.log('Icons generated in /icons/');
