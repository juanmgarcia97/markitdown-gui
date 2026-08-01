#!/usr/bin/env node
/**
 * Creates minimal placeholder icon files for development.
 * Replace these with real icons before production builds.
 */
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

// Minimal valid 1x1 pixel PNG (RGB, no alpha)
function createPng() {
  const buf = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
    '53de0000000c4944415408d763f84f0000000101000518d84d4e0000000049' +
    '454e44ae426082',
    'hex'
  );
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), buf);
  console.log('Created icon.png (%d bytes)', buf.length);
}

// Minimal valid ICO with a 16x16 32-bit BMP image
function createIco() {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type: icon
  header.writeUInt16LE(1, 4);  // image count

  // Directory entry: 16 bytes
  const dir = Buffer.alloc(16);
  dir.writeUInt8(16, 0);       // width
  dir.writeUInt8(16, 1);       // height
  dir.writeUInt8(0, 2);        // color palette
  dir.writeUInt8(0, 3);        // reserved
  dir.writeUInt16LE(1, 4);     // color planes
  dir.writeUInt16LE(32, 6);    // bits per pixel

  const bmpHeaderSize = 40;
  const pixelCount = 16 * 16;
  const pixelDataSize = pixelCount * 4;
  const andMaskSize = 16 * 2;  // 16 rows, 2 bytes each (padded to DWORD = 4)
  const andMaskPadded = 16 * 4; // padded to 4-byte boundary per row
  const imageSize = bmpHeaderSize + pixelDataSize + andMaskPadded;
  dir.writeUInt32LE(imageSize, 8);
  dir.writeUInt32LE(22, 12);   // offset from start

  // BITMAPINFOHEADER: 40 bytes
  const bmp = Buffer.alloc(bmpHeaderSize);
  bmp.writeUInt32LE(40, 0);
  bmp.writeInt32LE(16, 4);     // width
  bmp.writeInt32LE(32, 8);     // height * 2 (ICO quirk)
  bmp.writeUInt16LE(1, 12);    // planes
  bmp.writeUInt16LE(32, 14);   // bpp
  bmp.writeUInt32LE(0, 16);    // compression
  bmp.writeUInt32LE(pixelDataSize + andMaskPadded, 20);

  // Pixel data: 16x16 BGRA (dark blue placeholder)
  const pixels = Buffer.alloc(pixelDataSize);
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    pixels[off]     = 0x80; // B
    pixels[off + 1] = 0x40; // G
    pixels[off + 2] = 0x20; // R
    pixels[off + 3] = 0xFF; // A
  }

  // AND mask (all 0 = fully visible), padded to 4 bytes/row
  const andMask = Buffer.alloc(andMaskPadded, 0);

  const ico = Buffer.concat([header, dir, bmp, pixels, andMask]);
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), ico);
  console.log('Created icon.ico (%d bytes)', ico.length);
}

// Minimal valid ICNS with icp4 entry (16x16 as PNG)
function createIcns() {
  // Reuse the PNG we already created (or use a 16x16 one)
  const png16 = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000010000000100806000000' +
    '1ff3ff610000001a4944415478016260a01060003000000000c000016e' +
    '360001ce37a1ee0000000049454e44ae426082',
    'hex'
  );

  // ICNS: magic(4) + fileSize(4) + [entryType(4) + entrySize(4) + data]*
  const entryType = Buffer.from('icp4'); // 16x16 retina icon in PNG
  const entrySize = Buffer.alloc(4);
  entrySize.writeUInt32BE(8 + png16.length, 0);

  const magic = Buffer.from('icns');
  const fileSize = Buffer.alloc(4);
  fileSize.writeUInt32BE(8 + 8 + png16.length, 0);

  const icns = Buffer.concat([magic, fileSize, entryType, entrySize, png16]);
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.icns'), icns);
  console.log('Created icon.icns (%d bytes)', icns.length);
}

createPng();
createIco();
createIcns();
console.log('\nPlaceholder icons created in assets/');
console.log('Replace with real icons using: node scripts/generate-icons.js <source.png>');
