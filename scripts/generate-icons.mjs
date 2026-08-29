// Regenerates the home-screen and browser-tab icons from the brand palette.
//
//   npm run icons
//
// The tile is a blue-to-green sweep taken from the logo, with the wordmark on
// top. When the real logo artwork lands in public/logo-light.svg, point MARK at
// its contents instead of the <text> below and rerun.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BRAND = "#1975bf";
const ACCENT = "#3ab54a";

/** @param {number} size @param {boolean} maskable */
const tile = (size, maskable) => {
  // Android masks maskable icons to a circle, so the mark shrinks into the
  // safe zone rather than losing its edges.
  const radius = maskable ? size * 0.5 : size * 0.22;
  const fontSize = maskable ? size * 0.24 : size * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="#ffffff">HIG</text>
</svg>`;
};

const targets = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/maskable-512.png", 512, true],
  ["src/app/apple-icon.png", 180, false],
  ["src/app/icon.png", 48, false],
];

mkdirSync("public/icons", { recursive: true });

for (const [file, size, maskable] of targets) {
  await sharp(Buffer.from(tile(size, maskable))).png().toFile(file);
  console.log("wrote", file);
}
