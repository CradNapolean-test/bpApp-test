// Generates the app's brand images from the real Ballistic Performance logo (assets/brand): the app icon, the Android adaptive icon
// layers, the splash images (light and dark), the favicon, and the in-app logo (the full badge for light backgrounds, and the teal
// BP mark alone for dark ones, where the badge's black disc and ring would disappear).
//   node apps/mobile/scripts/generate-brand-assets.cjs
// Rerun it and commit the result if the logo file changes. Uses sharp (already installed for the web app).
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const sharp = require(path.join(root, 'node_modules/sharp'));
const SRC = path.join(root, 'assets/brand/BALLISTIC_LOGO_LORES_CIRCLE_TEAL.png');
const OUT = path.join(__dirname, '../assets/images');
const BRAND_TEAL = [42, 191, 191]; // #2ABFBF
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = '#ffffff';

// `buf` scaled to `fraction` of a size x size canvas, centred.
async function onCanvas(buf, size, fraction, background) {
  const inner = Math.round(size * fraction);
  const resized = await sharp(buf).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([{ input: resized, gravity: 'center' }]).png();
}

async function main() {
  // The badge, trimmed to its own edges (the source is transparent outside it) and made square.
  const trimmed = await sharp(SRC).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const side = Math.max(meta.width, meta.height);
  const badge = await sharp(trimmed).resize({ width: side, height: side, fit: 'contain', background: CLEAR }).png().toBuffer();

  // The BP mark alone, in brand teal with soft edges: how teal a pixel is (green well above red) becomes its opacity.
  const { data, info } = await sharp(badge).raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const raw = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const a = data[i * 4 + 3] / 255;
    const teal = Math.max(0, Math.min(1, (g - r) / 148)); // 148 = how far the logo's teal (25,173,177) sits above red
    raw[i * 4] = BRAND_TEAL[0];
    raw[i * 4 + 1] = BRAND_TEAL[1];
    raw[i * 4 + 2] = BRAND_TEAL[2];
    raw[i * 4 + 3] = Math.round(teal * a * 255);
  }
  const mark = await sharp(raw, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();

  // App icon: the full badge on white (the official lockup), no transparency (iOS requires that).
  await (await onCanvas(badge, 1024, 0.84, WHITE)).flatten({ background: WHITE }).removeAlpha().toFile(path.join(OUT, 'icon.png'));

  // Android adaptive icon: the badge inside the safe zone on transparent, a plain white background, and a one-colour version.
  await (await onCanvas(badge, 1024, 0.6, CLEAR)).toFile(path.join(OUT, 'android-icon-foreground.png'));
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: WHITE } }).png().toFile(path.join(OUT, 'android-icon-background.png'));
  await (await onCanvas(mark, 1024, 0.5, CLEAR)).toFile(path.join(OUT, 'android-icon-monochrome.png'));

  // Splash: the badge on white in light mode, the teal mark on #111 in dark mode (the plugin's two variants).
  await sharp(badge).resize({ width: 600 }).png().toFile(path.join(OUT, 'splash-icon.png'));
  await sharp(mark).resize({ width: 600 }).png().toFile(path.join(OUT, 'splash-icon-dark.png'));

  // Browser tab icon, and the logos shown inside the app (header, onboarding).
  await sharp(badge).resize({ width: 48, height: 48 }).png().toFile(path.join(OUT, 'favicon.png'));
  await sharp(badge).resize({ width: 512, height: 512 }).png().toFile(path.join(OUT, 'logo-badge.png'));
  await sharp(mark).resize({ width: 512 }).png().toFile(path.join(OUT, 'logo-mark.png'));

  const markMeta = await sharp(mark).metadata();
  console.log(`brand assets written to ${OUT} (badge ${side}px, mark ${markMeta.width}x${markMeta.height}px)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
