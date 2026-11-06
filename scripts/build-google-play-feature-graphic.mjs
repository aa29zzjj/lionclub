#!/usr/bin/env node
// Local vector layout/export only. Embeds the existing logo bytes untouched;
// never uploads, publishes, reads credentials or modifies the source image.
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "output/google-play/draft");
const sourceRelative = "mobile-app/src/lions-logo.png";
const source = resolve(root, sourceRelative);
const logo = await readFile(source);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sourceHash = sha256(logo);
const width = 1024, height = 500;
const name = "LionClubs_feature_graphic_draft_1024x500";

// Colors match mobile-app/src/styles.css: --lion-page, --lion-gold,
// --lion-text. The bitmap stays byte-identical inside this editable SVG.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1024" height="500" viewBox="0 0 1024 500" role="img"
     aria-labelledby="graphic-title graphic-description">
  <title id="graphic-title">LionClubs - 會員交流・服務活動</title>
  <desc id="graphic-description">Google Play feature graphic draft. Navy and gold vector layout using the unchanged existing LionClubs logo. Unapproved and unpublished.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#0a0d18"/>
      <stop offset="1" stop-color="#15233d"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="#c8a951"/>
      <stop offset="1" stop-color="#e4ce8c"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#background)"/>
  <g fill="none" stroke="#c8a951" stroke-width="1">
    <circle cx="818" cy="249" r="211" opacity="0.19"/>
    <circle cx="818" cy="249" r="257" opacity="0.11"/>
    <circle cx="818" cy="249" r="311" opacity="0.06"/>
  </g>
  <rect x="80" y="139" width="68" height="5" rx="2.5" fill="url(#accent)"/>
  <text x="78" y="226" fill="#f3f1ea" font-family="PingFang TC, Heiti TC, Arial, sans-serif"
        font-size="65" font-weight="600" letter-spacing="-1.5">LionClubs</text>
  <text x="82" y="285" fill="#e4ce8c" font-family="PingFang TC, Heiti TC, sans-serif"
        font-size="31" font-weight="400" letter-spacing="2">會員交流・服務活動</text>
  <path d="M82 321H520" stroke="#c8a951" stroke-width="1" opacity="0.28"/>
  <rect x="675" y="105" width="286" height="288" rx="28" fill="#ffffff"/>
  <image x="690" y="121" width="256" height="256" preserveAspectRatio="xMidYMid meet"
         xlink:href="data:image/png;base64,${logo.toString("base64")}"/>
</svg>
`;

assert.equal(sha256(Buffer.from(svg.match(/base64,([^\"]+)/)[1], "base64")), sourceHash);
await mkdir(output, { recursive: true });
const svgPath = resolve(output, `${name}.svg`);
const pngPath = resolve(output, `${name}.png`);
await writeFile(svgPath, svg, "utf8");
await sharp(Buffer.from(svg))
  .flatten({ background: "#0a0d18" })
  .removeAlpha()
  .toColourspace("srgb")
  .png({ compressionLevel: 9, palette: false, progressive: false })
  .toFile(pngPath);

const png = await readFile(pngPath);
const info = await sharp(png).metadata();
assert.equal(info.width, width);
assert.equal(info.height, height);
assert.equal(info.channels, 3);
assert.equal(info.hasAlpha, false);
assert.equal(info.space, "srgb");
assert.equal(png[25], 2, "PNG IHDR color type must be truecolor RGB (no palette/alpha)");
assert.equal(sha256(await readFile(source)), sourceHash, "Source logo must remain unchanged");

const manifest = {
  status: "draft-unapproved-unpublished",
  purpose: "Google Play feature graphic candidate; not a device screenshot",
  width, height, color: "24-bit RGB PNG, sRGB, no alpha",
  sourceLogo: { path: sourceRelative, sha256: sourceHash, bytesUnchanged: true },
  files: {
    [`${name}.svg`]: { sha256: sha256(Buffer.from(svg)), bytes: Buffer.byteLength(svg) },
    [`${name}.png`]: { sha256: sha256(png), bytes: png.length },
  },
  approvalRequired: ["brand and logo usage rights", "visual/content review before upload"],
  uploaded: false,
};
await writeFile(resolve(output, "feature-graphic-draft-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, svg: svgPath, png: pngPath, width, height, channels: info.channels, hasAlpha: info.hasAlpha, originalLogoUnchanged: true }, null, 2));

// Play store icon is separate from launcher/iOS icons. Place the unchanged
// circular brand mark on a full white square; do not add a mask or drop shadow.
const iconSourceRelative = "mobile-app/src/lions-logo.png";
const iconSource = resolve(root, iconSourceRelative);
const iconSourceBytes = await readFile(iconSource);
const iconSourceHash = sha256(iconSourceBytes);
const iconSourceInfo = await sharp(iconSourceBytes).metadata();
assert.equal(iconSourceInfo.width, 256);
assert.equal(iconSourceInfo.height, 256);
const iconName = "LionClubs_app_icon_draft_512x512";
const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="512" height="512" viewBox="0 0 512 512" role="img"
     aria-labelledby="icon-title icon-description">
  <title id="icon-title">LionClubs app icon draft</title>
  <desc id="icon-description">White full-square Play icon layout referencing the unchanged circular LionClubs brand mark. No crop, retouch, badge, drop shadow or rounded outer mask. Unapproved and unpublished.</desc>
  <rect width="512" height="512" fill="#ffffff"/>
  <image x="64" y="64" width="384" height="384" preserveAspectRatio="xMidYMid meet"
         xlink:href="data:image/png;base64,${iconSourceBytes.toString("base64")}"/>
</svg>
`;
assert.equal(sha256(Buffer.from(iconSvg.match(/base64,([^\"]+)/)[1], "base64")), iconSourceHash);
const iconSvgPath = resolve(output, `${iconName}.svg`);
const iconPngPath = resolve(output, `${iconName}.png`);
await writeFile(iconSvgPath, iconSvg, "utf8");
await sharp(Buffer.from(iconSvg))
  .flatten({ background: "#ffffff" })
  .toColourspace("srgb")
  .ensureAlpha(1)
  .png({ compressionLevel: 9, palette: false, progressive: false })
  .toFile(iconPngPath);
const iconPng = await readFile(iconPngPath);
const iconInfo = await sharp(iconPng).metadata();
assert.equal(iconInfo.width, 512);
assert.equal(iconInfo.height, 512);
assert.equal(iconInfo.channels, 4);
assert.equal(iconInfo.hasAlpha, true);
assert.equal(iconInfo.space, "srgb");
assert.equal(iconPng[24], 8, "Icon PNG must use 8 bits per channel");
assert.equal(iconPng[25], 6, "Icon PNG must be 32-bit truecolor RGBA");
assert.ok(iconPng.length < 1024 * 1024, "Icon PNG must be below 1 MiB");
const iconPixels = await sharp(iconPng).raw().toBuffer();
for (let offset = 3; offset < iconPixels.length; offset += 4) {
  assert.equal(iconPixels[offset], 255, "Every icon pixel must be fully opaque");
}
assert.equal(sha256(await readFile(iconSource)), iconSourceHash, "Source icon must remain unchanged");
const iconManifest = {
  status: "draft-unapproved-unpublished",
  purpose: "Google Play app icon candidate; unchanged circular brand mark on a full white square",
  width: 512, height: 512, color: "32-bit RGBA PNG, sRGB, alpha uniformly 255 (fully opaque)",
  sourceIcon: { path: iconSourceRelative, width: iconSourceInfo.width, height: iconSourceInfo.height, sha256: iconSourceHash, bytesUnchanged: true },
  sourceArtworkUnmodified: true,
  placement: { x: 64, y: 64, width: 384, height: 384 },
  fullSquareBackground: "#ffffff",
  allAlphaValues255: true,
  below1MiB: true,
  newRoundingShadowCropOrBadgeAdded: false,
  files: {
    [`${iconName}.svg`]: { sha256: sha256(Buffer.from(iconSvg)), bytes: Buffer.byteLength(iconSvg) },
    [`${iconName}.png`]: { sha256: sha256(iconPng), bytes: iconPng.length },
  },
  approvalRequired: ["brand and artwork usage rights", "source artwork suitability and visual review before upload"],
  uploaded: false,
};
await writeFile(resolve(output, "app-icon-draft-manifest.json"), `${JSON.stringify(iconManifest, null, 2)}\n`);
console.log(JSON.stringify({ status: iconManifest.status, svg: iconSvgPath, png: iconPngPath, width: iconInfo.width, height: iconInfo.height, channels: iconInfo.channels, hasAlpha: iconInfo.hasAlpha, allAlphaValues255: true, bytes: iconPng.length, originalBrandMarkUnchanged: true }, null, 2));
