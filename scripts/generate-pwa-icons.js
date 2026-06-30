const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const output = path.resolve(__dirname, "..", "icons");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [xi, yi] = points[index];
    const [xj, yj] = points[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function createIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 512;
  const colors = {
    navy: [4, 22, 39, 255],
    white: [247, 249, 255, 255],
    blue: [210, 228, 251, 255],
    green: [87, 199, 133, 255]
  };
  const envelope = [128, 164, 384, 348].map((value) => value * scale);
  const flap = [[128, 164], [256, 268], [384, 164], [384, 212], [256, 316], [128, 212]].map(([x, y]) => [x * scale, y * scale]);
  const check = [[351, 122], [393, 164], [256, 301], [182, 227], [224, 185], [256, 217]].map(([x, y]) => [x * scale, y * scale]);

  for (let y = 0; y < size; y += 1) {
    pixels[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      let color = colors.navy;
      if (insideRoundedRect(x, y, 0, 0, size - 1, size - 1, 96 * scale)) color = colors.navy;
      if (x >= envelope[0] && x <= envelope[2] && y >= envelope[1] && y <= envelope[3]) color = colors.white;
      if (insidePolygon(x, y, flap)) color = colors.blue;
      if (insidePolygon(x, y, check)) color = colors.green;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set(color, offset);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "icon-192.png"), createIcon(192));
fs.writeFileSync(path.join(output, "icon-512.png"), createIcon(512));
fs.copyFileSync(path.join(output, "icon-512.png"), path.join(output, "icon-maskable-512.png"));
