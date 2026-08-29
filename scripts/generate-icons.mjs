// Regenerates the home-screen and browser-tab icons from the logo.
//
//   npm run icons
//
// Run it after replacing public/logo-light.png, and the icons follow.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const LOGO = "public/logo-light.png";

// A near-white ground rather than the brand gradient: the mark carries its own
// colours, and a coloured logo on a coloured sweep goes muddy.
const GROUND = { r: 0xf7, g: 0xf9, b: 0xfb, alpha: 1 };

/** @param {number} size @param {boolean} maskable */
async function tile(size, maskable) {
  // Android masks maskable icons to a circle, so the mark sits well inside the
  // safe zone; a plain icon can breathe closer to the edge.
  const inset = maskable ? 0.56 : 0.72;
  const radius = maskable ? size / 2 : Math.round(size * 0.22);

  const logo = await sharp(LOGO)
    .resize({
      width: Math.round(size * inset),
      height: Math.round(size * inset),
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer();

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/>
     </svg>`,
  );

  return sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
    .composite([
      { input: logo, gravity: "center" },
      // Rounds the corners by keeping only what the mask covers.
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toBuffer();
}

const targets = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/maskable-512.png", 512, true],
  ["src/app/apple-icon.png", 180, false],
  ["src/app/icon.png", 48, false],
];

mkdirSync("public/icons", { recursive: true });

for (const [file, size, maskable] of targets) {
  await sharp(await tile(size, maskable)).toFile(file);
  console.log("wrote", file);
}
