import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import sharp from "sharp";
import { THRESHOLDS } from "./config";
import { SAMPLE_IMAGES } from "./samples";
import { blurCheck } from "./stages";

const IMAGES_DIR = join(__dirname, "images");
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

type Row = {
  filename: string;
  tests: string;
  width: number;
  height: number;
  longEdge: number;
  needsUpscale: boolean;
  blurScore: number;
  isBlurry: boolean;
};

async function listImages(): Promise<string[]> {
  const entries = await readdir(IMAGES_DIR).catch(() => [] as string[]);
  return entries
    .filter((name) => IMAGE_EXTENSIONS.includes(extname(name).toLowerCase()))
    .sort();
}

async function checkImage(filename: string): Promise<Row> {
  const bytes = await readFile(join(IMAGES_DIR, filename));
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const longEdge = Math.max(width, height);
  const blur = await blurCheck(bytes);

  return {
    filename,
    tests:
      SAMPLE_IMAGES.find((s) => s.filename === filename)?.tests ??
      "your own image",
    width,
    height,
    longEdge,
    needsUpscale: longEdge < THRESHOLDS.upscaleMinLongEdge,
    blurScore: blur.blurScore,
    isBlurry: blur.isBlurry,
  };
}

function printTable(rows: Row[]): void {
  const nameWidth = Math.max(8, ...rows.map((r) => r.filename.length));
  console.log(
    "thresholds: blurScore < %d is blurry, long edge < %dpx needsUpscale\n",
    THRESHOLDS.blurScore,
    THRESHOLDS.upscaleMinLongEdge
  );
  console.log(
    "filename".padEnd(nameWidth),
    "dimensions".padEnd(12),
    "needsUpscale".padEnd(13),
    "blurScore".padStart(10),
    " verdict"
  );
  for (const row of rows) {
    console.log(
      row.filename.padEnd(nameWidth),
      `${row.width}x${row.height}`.padEnd(12),
      String(row.needsUpscale).padEnd(13),
      row.blurScore.toFixed(1).padStart(10),
      " " + (row.isBlurry ? "TOO BLURRY" : "ok")
    );
  }
}

async function main(): Promise<void> {
  const filenames = await listImages();
  if (filenames.length === 0) {
    console.error(
      "No images in replicate-testing/images/. Run `npm run replicate:samples` first, or drop your own in."
    );
    process.exit(1);
  }

  console.log(
    `Checking ${filenames.length} image(s) against the local-only pipeline stages (blur, dimensions, upscale decision). No Replicate calls, no cost.\n`
  );

  const rows: Row[] = [];
  for (const filename of filenames) {
    rows.push(await checkImage(filename));
  }

  printTable(rows);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
