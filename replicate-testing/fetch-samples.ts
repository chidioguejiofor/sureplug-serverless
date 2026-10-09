import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  DERIVED_BLUR_SIGMA,
  DERIVED_DOWNSCALE_LONG_EDGE,
  SAMPLE_IMAGES,
  SampleImage,
} from "./samples";

const IMAGES_DIR = join(__dirname, "images");
const USER_AGENT =
  "sureplug-media-pipeline-testing/1.0 (local development; contact: engineering@sureplug.example)";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(sample: SampleImage, url: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(
      `Could not download ${sample.filename}: ${response.status} ${url}`
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(join(IMAGES_DIR, sample.filename), bytes);
  console.log(
    `  downloaded ${sample.filename} (${(bytes.length / 1048576).toFixed(1)}MB)`
  );
}

async function derive(
  sample: SampleImage,
  from: string,
  transform: "downscale" | "blur"
): Promise<void> {
  const sourcePath = join(IMAGES_DIR, from);
  if (!(await exists(sourcePath))) {
    throw new Error(
      `${sample.filename} is derived from ${from}, which has not been downloaded`
    );
  }

  const source = sharp(await readFile(sourcePath));
  const transformed =
    transform === "downscale"
      ? source.resize(DERIVED_DOWNSCALE_LONG_EDGE, DERIVED_DOWNSCALE_LONG_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
      : source.blur(DERIVED_BLUR_SIGMA);

  const bytes = await transformed.toBuffer();
  await writeFile(join(IMAGES_DIR, sample.filename), bytes);
  console.log(`  derived ${sample.filename} (${transform} of ${from})`);
}

async function main(): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true });

  const downloads = SAMPLE_IMAGES.filter((s) => s.source.kind === "download");
  const derived = SAMPLE_IMAGES.filter((s) => s.source.kind === "derived");

  console.log(
    `Fetching ${downloads.length} sample images and deriving ${derived.length} more into replicate-testing/images/`
  );

  for (const sample of [...downloads, ...derived]) {
    if (await exists(join(IMAGES_DIR, sample.filename))) {
      console.log(`  skipped ${sample.filename} (already present)`);
      continue;
    }
    if (sample.source.kind === "download") {
      await download(sample, sample.source.url);
    } else {
      await derive(sample, sample.source.from, sample.source.transform);
    }
  }

  console.log(
    "\nDone. Drop any of your own product photos into the same folder and they will be picked up too."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
