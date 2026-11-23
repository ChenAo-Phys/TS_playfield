// Convert the card galleries in game_resources/ to web-sized WebP in public/cards/{en,zh}/NNN.webp.
// Both languages are normalised to the same 5:7 size so they lay out identically.
//
// English cards follow the errata (CLAUDE.md "use the original card designs, adjusted to match the errata"): a few
// images lack a printed line the others carry, which is composited in here from another card of the same gallery
// (same font, size and background), never edited in game_resources/ (QA K-003):
// - #98 Aldrich Ames Remix, #109 Yuri and Samantha, #110 AWACS Sale to Saudis are starred (removed after their Event)
//   but lack the red "Remove from play if used as an event." line: it is copied from #44 Bear Trap, at the same
//   place as on every starred card (its background is the cards' plain light blue, as is the target area).
// - #42 Quagmire lacks "cancels NORAD": not done. Its text block is full (the line would need a relayout of the card
//   bottom) and no font matching the card's typeface is available to set it; an approximation looked worse than the
//   original, so the card text (card_text.json, shown in the card zoom) carries it.
import { readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = { en: 'English_card_gallery', zh: 'Chinese_card_gallery' };
const W = 500, H = 700;

/** The red "Remove from play if used as an event." line of #44 Bear Trap, in source pixels (375 x 525). */
const RED_LINE = { card: '044', left: 40, top: 470, width: 295, height: 28 };
/** English overlays: card number -> [source card region, pasted at the same place]. */
const OVERLAYS = { '098': [RED_LINE], '109': [RED_LINE], '110': [RED_LINE] };

/** The source file of card `nnn` in `src`. */
const fileOf = (files, nnn) => files.find(f => f.startsWith(`${nnn}_`));

async function overlaid(src, files, f) {
  const layers = OVERLAYS[f.slice(0, 3)];
  if (!layers) return sharp(join(src, f));
  const composites = await Promise.all(layers.map(async l => ({
    input: await sharp(join(src, fileOf(files, l.card))).extract({ left: l.left, top: l.top, width: l.width, height: l.height }).png().toBuffer(),
    left: l.left, top: l.top,
  })));
  // Composite at the source size, then resize like every other card.
  return sharp(await sharp(join(src, f)).composite(composites).png().toBuffer());
}

for (const [lang, dir] of Object.entries(SETS)) {
  const src = join(ROOT, 'game_resources', dir);
  const out = join(ROOT, 'public', 'cards', lang);
  await mkdir(out, { recursive: true });
  const files = (await readdir(src)).filter(f => /^\d{3}_.*\.jpe?g$/i.test(f));
  await Promise.all(files.map(async f => {
    const img = lang === 'en' ? await overlaid(src, files, f) : sharp(join(src, f));
    await img.resize(W, H, { fit: 'fill' }).webp({ quality: 82 }).toFile(join(out, `${f.slice(0, 3)}.webp`));
  }));
  console.log(`${lang}: ${files.length} cards -> public/cards/${lang}/`);
}
