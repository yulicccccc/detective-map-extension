// scripts/generate-icons.js
const fs = require('fs');
const path = require('path');

// Simple minimal 1x1 to NxN PNG generator or SVG to PNG generator
// Let's create crisp SVG icons and use minimal PNG encoder or write SVGs and convert them.
// Or we can use a pure JS PNG generator.

function createPNG(size) {
  // We can write a valid PNG buffer using raw deflate/zlib
  const zlib = require('zlib');

  const width = size;
  const height = size;

  // RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.46;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Base navy circle (#0f172a)
        let r = 15, g = 23, b = 42, a = 255;

        // Lens ring
        const ldx = x - width * 0.42;
        const ldy = y - height * 0.42;
        const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
        const lradius = width * 0.22;
        const lthickness = Math.max(1.5, width * 0.06);

        if (Math.abs(ldist - lradius) <= lthickness / 2) {
          // Amber ring (#f59e0b)
          r = 245; g = 158; b = 11; a = 255;
        } else if (ldist < lradius) {
          // Inside lens (#1e293b)
          r = 30; g = 41; b = 59; a = 255;
        }

        // Pencil / handle
        const px = x - width * 0.58;
        const py = y - height * 0.58;
        const proj = (px + py) / Math.SQRT2;
        const perp = Math.abs(px - py) / Math.SQRT2;

        if (proj >= 0 && proj <= width * 0.35 && perp <= Math.max(1.2, width * 0.05)) {
          // Cyan handle/pencil (#38bdf8)
          r = 56; g = 189; b = 248; a = 255;
        }

        // Pencil tip / dot
        const tipDist = Math.hypot(x - width * 0.82, y - height * 0.82);
        if (tipDist <= Math.max(1.5, width * 0.06)) {
          r = 251; g = 191; b = 36; a = 255;
        }

        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = a;
      } else {
        // Transparent outside circle
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }

  // Build uncompressed scanlines (filter type 0 + RGBA)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanlineOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanlineOffset++] = 0; // Filter None
    const row = rgba.subarray(y * width * 4, (y + 1) * width * 4);
    row.copy(scanlines, scanlineOffset);
    scanlineOffset += width * 4;
  }

  const compressedData = zlib.deflateSync(scanlines);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);

    let c = 0xffffffff;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) {
        v = (v & 1) ? (0xedb88320 ^ (v >>> 1)) : (v >>> 1);
      }
      table[n] = v;
    }
    for (let i = 0; i < full.length; i++) {
      c = table[(c ^ full[i]) & 0xff] ^ (c >>> 8);
    }
    const crc = (c ^ 0xffffffff) >>> 0;
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const png = createPNG(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
});
