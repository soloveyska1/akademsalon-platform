// Prepare the publication copies of the supplied 465 × 732 chat screenshot.
// Usage: node prepare_review70.cjs <source.png> <output directory>
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function prepare(source, destination) {
  const input = await fs.readFile(source);
  const { width, height } = await sharp(input).metadata();
  if (width !== 465 || height !== 732) {
    throw new Error('Unexpected screenshot dimensions. Check the privacy masks before publishing.');
  }
  const masks = Buffer.from(
    '<svg width="465" height="732" xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="#c6d8e7"><rect x="28" y="29" width="75" height="22" rx="5"/>' +
    '<rect x="28" y="602" width="66" height="22" rx="5"/></g></svg>'
  );
  const overlays = [{ input: masks, top: 0, left: 0 }];
  const circle = Buffer.from('<svg width="26" height="26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="13" fill="white"/></svg>');
  for (const top of [145, 265, 629]) {
    const tiny = await sharp(input).extract({ left: 55, top, width: 26, height: 26 })
      .resize(3, 3).png().toBuffer();
    const mosaic = await sharp(tiny).resize(26, 26, { kernel: 'nearest' }).ensureAlpha()
      .composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
    overlays.push({ input: mosaic, left: 55, top });
  }
  const masked = await sharp(input).composite(overlays).png().toBuffer();
  const proof = sharp(masked).extract({ left: 0, top: 13, width: 465, height: 715 });
  const thumbs = path.join(destination, 'thumbs');
  await fs.mkdir(thumbs, { recursive: true });
  await proof.clone().webp({ lossless: true, effort: 6 }).toFile(path.join(destination, 'review-70.webp'));
  await proof.clone().resize({ width: 420 }).webp({ quality: 88, effort: 6 })
    .toFile(path.join(thumbs, 'review-70.webp'));
  await sharp(masked).extract({ left: 16, top: 303, width: 280, height: 280 })
    .webp({ quality: 91, effort: 6 }).toFile(path.join(destination, 'review-70-photo.webp'));
}

prepare(process.argv[2], process.argv[3]).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
