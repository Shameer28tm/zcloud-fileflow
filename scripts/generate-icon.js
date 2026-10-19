import fs from "node:fs";
import zlib from "node:zlib";

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function makePng(width, height, getPixel) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // IDAT
  const idatChunk = makeChunk("IDAT", compressed);

  // IEND
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crc = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

// Generate 512x512 icon for Zcloud FileFlow
const size = 512;
const pngBuf = makePng(size, size, (x, y) => {
  // Center rounded square badge
  const margin = 32;
  const rad = 72;
  const bx = x - margin;
  const by = y - margin;
  const bw = size - margin * 2;
  const bh = size - margin * 2;

  // Check if within rounded rect
  let inBadge = false;
  if (bx >= 0 && bx < bw && by >= 0 && by < bh) {
    const dx = Math.max(0, Math.max(rad - bx, bx - (bw - rad)));
    const dy = Math.max(0, Math.max(rad - by, by - (bh - rad)));
    if (dx * dx + dy * dy <= rad * rad) {
      inBadge = true;
    }
  }

  if (!inBadge) {
    return [0, 0, 0, 0];
  }

  // Gradient: deep navy to subtle cyan-blue
  const t = (x + y) / (size * 2);
  const r = Math.round(14 * (1 - t) + 38 * t);
  const g = Math.round(28 * (1 - t) + 115 * t);
  const b = Math.round(52 * (1 - t) + 246 * t);

  // Draw 'Z' symbol in center
  const cx = size / 2;
  const cy = size / 2;
  const nx = (x - cx) / 110;
  const ny = (y - cy) / 110;

  let inZ = false;
  if (ny >= -1.0 && ny <= -0.65 && nx >= -0.9 && nx <= 0.9) inZ = true; // top bar
  else if (ny >= 0.65 && ny <= 1.0 && nx >= -0.9 && nx <= 0.9) inZ = true; // bottom bar
  else {
    // diagonal
    const diagDist = Math.abs(nx + ny);
    if (diagDist < 0.28 && nx >= -0.9 && nx <= 0.9 && ny >= -1.0 && ny <= 1.0) {
      inZ = true;
    }
  }

  if (inZ) {
    return [255, 255, 255, 255];
  }

  return [r, g, b, 255];
});

fs.writeFileSync("app-icon.png", pngBuf);
console.log("Created app-icon.png (512x512)");
