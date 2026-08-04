/**
 * Derives the web-ready images in public/ from the untouched originals in
 * design-export/assets/.
 *
 * The export ships a 2.8 MB hero PNG. On conference Wi-Fi that alone is the
 * difference between a booth visitor signing up and walking away, so we
 * pre-encode AVIF/WebP at sensible widths rather than leaning on runtime
 * optimization. Re-run with `npm run optimize:images` after replacing a source.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "design-export", "assets");
const OUT = path.join(root, "public", "img");

/** @type {{src: string, name: string, widths: number[], formats: ("avif"|"webp")[], fit?: "cover"|"inside"}[]} */
const JOBS = [
  {
    src: "awning-hero.png",
    name: "awning-hero",
    widths: [640, 960, 1280],
    formats: ["avif", "webp"],
    fit: "cover",
  },
];

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const job of JOBS) {
    const srcPath = path.join(SRC, job.src);
    const before = (await stat(srcPath)).size;
    const input = await readFile(srcPath);
    let after = 0;

    for (const width of job.widths) {
      for (const format of job.formats) {
        const pipeline = sharp(input).resize({
          width,
          withoutEnlargement: true,
          fit: job.fit ?? "inside",
        });
        const buf = await (format === "avif"
          ? pipeline.avif({ quality: 55, effort: 6 })
          : pipeline.webp({ quality: 76 })
        ).toBuffer();
        await writeFile(path.join(OUT, `${job.name}-${width}.${format}`), buf);
        after += buf.length;
      }
    }
    console.log(
      `${job.src}: ${kb(before)} → ${job.widths.length * job.formats.length} variants, ${kb(after)} total`,
    );
  }

  // The wordmark is small and needs a crisp alpha channel — keep PNG, just
  // strip metadata and re-compress losslessly.
  const markSrc = path.join(SRC, "markilux-wordmark.png");
  const markBefore = (await stat(markSrc)).size;
  const mark = await sharp(await readFile(markSrc))
    .resize({ width: 300, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await writeFile(path.join(OUT, "markilux-wordmark.png"), mark);
  console.log(`markilux-wordmark.png: ${kb(markBefore)} → ${kb(mark.length)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
