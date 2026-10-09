import "dotenv/config";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import prompts from "prompts";
import sharp from "sharp";
import {
  BACKGROUND_REMOVAL_CANDIDATES,
  CLASSIFIER_CANDIDATES,
  CandidateModel,
  THRESHOLDS,
  UPSCALE_CANDIDATES,
} from "./config";
import { SAMPLE_IMAGES } from "./samples";
import {
  ResolvedModel,
  resolveModel,
  uploadBytes,
  uploadImage,
} from "./replicate";
import {
  blurCheck,
  classify,
  composeMaster,
  cropSubject,
  removeBackground,
  renderVariants,
  upscale,
} from "./stages";
import { buildReport } from "./report";
import { CellRecord, ImageRecord, ModelRecord, RunRecord } from "./run-record";

const IMAGES_DIR = join(__dirname, "images");
const RESULTS_DIR = join(__dirname, "results");
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token.startsWith("<")) {
    console.error(
      "REPLICATE_API_TOKEN is not set in .env (it is still the placeholder).\n" +
        "Get one from https://replicate.com/account/api-tokens and put it in sureplug-serverless/.env"
    );
    process.exit(1);
  }

  const available = await listImages();
  if (available.length === 0) {
    console.error(
      "No images in replicate-testing/images/. Run `npm run replicate:samples` first, or drop your own in."
    );
    process.exit(1);
  }

  const answers = await askWhatToRun(available);
  if (!answers) {
    console.log("Nothing selected, exiting.");
    return;
  }

  const { images, classifier, backgroundRemovers, upscaler, forceUpscale } =
    answers;

  const resolved = new Map<string, ResolvedModel>();
  const modelRecords: ModelRecord[] = [];
  console.log("\nResolving model schemas from Replicate...");
  for (const candidate of [
    ...(classifier ? [classifier] : []),
    ...backgroundRemovers,
    ...(upscaler ? [upscaler] : []),
  ]) {
    const model = await resolveModel(candidate.slug, token);
    resolved.set(candidate.slug, model);
    modelRecords.push(describeModel(candidate, model));
    reportSchema(candidate, model);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(RESULTS_DIR, runId);
  await mkdir(runDir, { recursive: true });

  const record: RunRecord = {
    runId,
    startedAt: new Date().toISOString(),
    thresholds: { ...THRESHOLDS },
    models: modelRecords,
    images: [],
  };

  for (const filename of images) {
    console.log(`\n=== ${filename} ===`);
    record.images.push(
      await runImage({
        filename,
        runDir,
        token,
        classifier,
        backgroundRemovers,
        upscaler,
        forceUpscale,
        resolved,
      })
    );
    await writeFile(
      join(runDir, "run.json"),
      JSON.stringify(record, null, 2) + "\n"
    );
  }

  const reportPath = join(runDir, "report.html");
  await writeFile(reportPath, buildReport(record));
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Open it with:  open "${reportPath}"`);
}

type RunImageOptions = {
  filename: string;
  runDir: string;
  token: string;
  classifier: CandidateModel | null;
  backgroundRemovers: CandidateModel[];
  upscaler: CandidateModel | null;
  forceUpscale: boolean;
  resolved: Map<string, ResolvedModel>;
};

async function runImage(options: RunImageOptions): Promise<ImageRecord> {
  const { filename, runDir, token, resolved } = options;
  const sample = SAMPLE_IMAGES.find((s) => s.filename === filename);
  const imageDir = join(runDir, stem(filename));
  await mkdir(imageDir, { recursive: true });

  const source = await readFile(join(IMAGES_DIR, filename));
  const originalName = `00-original${extname(filename)}`;
  await writeFile(join(imageDir, originalName), source);
  const metadata = await sharp(source).metadata();

  const blur = await blurCheck(source);
  console.log(
    `  blur score ${blur.blurScore.toFixed(1)} (threshold ${
      THRESHOLDS.blurScore
    }) -> ${blur.isBlurry ? "TOO BLURRY" : "ok"}`
  );

  console.log("  uploading to Replicate...");
  const imageUrl = await uploadImage(join(IMAGES_DIR, filename), token);

  const record: ImageRecord = {
    filename,
    tests: sample?.tests ?? "Your own image",
    expectedClassification: sample?.expectedClassification ?? null,
    originalPath: `${stem(filename)}/${originalName}`,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    blurScore: blur.blurScore,
    isBlurry: blur.isBlurry,
    classification: null,
    classificationRaw: null,
    classificationModelLabel: null,
    cells: [],
  };

  if (options.classifier) {
    const model = resolved.get(options.classifier.slug);
    if (model) {
      const result = await classify(
        imageUrl,
        options.classifier,
        model,
        token
      );
      record.classification = result.classification;
      record.classificationRaw = result.rawOutput;
      record.classificationModelLabel = options.classifier.label;
      const expectation = record.expectedClassification;
      const verdict =
        expectation === null
          ? ""
          : expectation === result.classification
            ? " (as expected)"
            : ` (EXPECTED ${expectation})`;
      console.log(
        `  classified ${result.classification}${verdict} - raw: ${JSON.stringify(
          result.rawOutput.slice(0, 80)
        )}`
      );
    }
  }

  if (record.classification === "KEEP") {
    console.log(
      "  KEEP: production would skip background removal and render variants from the raw upload"
    );
    return record;
  }

  if (options.backgroundRemovers.length > 0) {
    for (const candidate of options.backgroundRemovers) {
      record.cells.push(
        await runCell({ ...options, candidate, imageDir, imageUrl })
      );
    }
  } else if (options.upscaler) {
    record.cells.push(
      await runUpscaleOnlyCell({
        ...options,
        imageDir,
        imageUrl,
        source,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
      })
    );
  }

  return record;
}

async function runCell(
  options: RunImageOptions & {
    candidate: CandidateModel;
    imageDir: string;
    imageUrl: string;
  }
): Promise<CellRecord> {
  const { candidate, imageDir, imageUrl, token, resolved } = options;
  const cellDir = join(imageDir, candidate.label.replace(/[^\w-]+/g, "-"));
  const relative = (name: string) =>
    `${basename(imageDir)}/${basename(cellDir)}/${name}`;

  const cell: CellRecord = {
    modelLabel: candidate.label,
    modelSlug: candidate.slug,
    error: null,
    removeBackground: null,
    cutoutPath: null,
    hasAlphaChannel: null,
    coverageRatio: null,
    cropPlan: null,
    croppedPath: null,
    masterPath: null,
    masterWidth: null,
    masterHeight: null,
    needsUpscale: null,
    upscale: null,
    variants: [],
  };

  try {
    await mkdir(cellDir, { recursive: true });
    const model = resolved.get(candidate.slug);
    if (!model) {
      throw new Error(`${candidate.slug} was never resolved`);
    }

    console.log(`  [${candidate.label}] removing background...`);
    const removed = await removeBackground(imageUrl, candidate, model, token);
    cell.removeBackground = {
      status: removed.run.prediction.status,
      wallClockMs: removed.run.wallClockMs,
      predictTimeSeconds: removed.run.predictTimeSeconds,
    };
    await writeFile(join(cellDir, "01-cutout.png"), removed.cutout);
    cell.cutoutPath = relative("01-cutout.png");

    console.log(
      `  [${candidate.label}] waiting 10s before the next Replicate request (rate limit)...`
    );
    await sleep(10_000);

    const cropped = await cropSubject(removed.cutout);
    cell.hasAlphaChannel = cropped.hasAlphaChannel;
    cell.coverageRatio = cropped.bounds?.coverageRatio ?? null;
    cell.cropPlan = cropped.plan;

    if (!cropped.hasAlphaChannel) {
      console.log(
        `  [${candidate.label}] WARNING: output has no alpha channel - this model needs its format/background inputs set to return transparency`
      );
    }

    if (cropped.plan.outcome === "NEEDS_REUPLOAD" || !cropped.cropped) {
      console.log(
        `  [${candidate.label}] crop rejected: ${
          cropped.plan.outcome === "NEEDS_REUPLOAD"
            ? cropped.plan.reason
            : "no cropped output"
        } (coverage ${formatRatio(cell.coverageRatio)})`
      );
      return cell;
    }

    await writeFile(join(cellDir, "02-cropped.png"), cropped.cropped);
    cell.croppedPath = relative("02-cropped.png");

    const composed = await composeMaster(cropped.cropped);
    await writeFile(join(cellDir, "03-master.png"), composed.master);
    cell.masterPath = relative("03-master.png");
    cell.masterWidth = composed.width;
    cell.masterHeight = composed.height;
    cell.needsUpscale = composed.needsUpscale;
    console.log(
      `  [${candidate.label}] master ${composed.width}x${
        composed.height
      }, coverage ${formatRatio(cell.coverageRatio)}, needsUpscale ${
        composed.needsUpscale
      }`
    );

    let variantSource = composed.master;

    if (options.upscaler && (composed.needsUpscale || options.forceUpscale)) {
      const upscaleModel = resolved.get(options.upscaler.slug);
      if (upscaleModel) {
        console.log(
          `  [${candidate.label}] upscaling with ${options.upscaler.label}...`
        );
        const masterUrl = await uploadBytes(
          composed.master,
          "master.png",
          token
        );
        const upscaled = await upscale(
          masterUrl,
          options.upscaler,
          upscaleModel,
          token
        );
        await writeFile(join(cellDir, "04-upscaled.png"), upscaled.upscaled);
        cell.upscale = {
          modelLabel: options.upscaler.label,
          path: relative("04-upscaled.png"),
          status: upscaled.run.prediction.status,
          wallClockMs: upscaled.run.wallClockMs,
          predictTimeSeconds: upscaled.run.predictTimeSeconds,
          width: upscaled.width,
          height: upscaled.height,
        };
        variantSource = upscaled.upscaled;
        console.log(
          `  [${candidate.label}] upscaled to ${upscaled.width}x${upscaled.height}`
        );
      }
    }

    const variants = await renderVariants(variantSource);
    await mkdir(join(cellDir, "variants"), { recursive: true });
    for (const variant of variants) {
      await writeFile(join(cellDir, "variants", variant.filename), variant.body);
      cell.variants.push({
        name: variant.name,
        format: variant.format,
        filename: relative(`variants/${variant.filename}`),
        width: variant.width,
        height: variant.height,
        sizeBytes: variant.body.length,
      });
    }
  } catch (error) {
    cell.error = error instanceof Error ? error.message : String(error);
    console.log(`  [${candidate.label}] FAILED: ${cell.error}`);
  }

  return cell;
}

async function runUpscaleOnlyCell(
  options: RunImageOptions & {
    imageDir: string;
    imageUrl: string;
    source: Buffer;
    width: number;
    height: number;
  }
): Promise<CellRecord> {
  const { token, resolved, imageDir, imageUrl, source, width, height } =
    options;
  const upscaler = options.upscaler;
  if (!upscaler) {
    throw new Error("runUpscaleOnlyCell called without an upscaler selected");
  }

  const cellDir = join(imageDir, upscaler.label.replace(/[^\w-]+/g, "-"));
  const relative = (name: string) =>
    `${basename(imageDir)}/${basename(cellDir)}/${name}`;

  const cell: CellRecord = {
    modelLabel: upscaler.label,
    modelSlug: upscaler.slug,
    error: null,
    removeBackground: null,
    cutoutPath: null,
    hasAlphaChannel: null,
    coverageRatio: null,
    cropPlan: null,
    croppedPath: null,
    masterPath: null,
    masterWidth: null,
    masterHeight: null,
    needsUpscale: null,
    upscale: null,
    variants: [],
  };

  try {
    await mkdir(cellDir, { recursive: true });
    const needsUpscale = Math.max(width, height) < THRESHOLDS.upscaleMinLongEdge;
    cell.needsUpscale = needsUpscale;

    let variantSource = source;

    if (needsUpscale || options.forceUpscale) {
      const model = resolved.get(upscaler.slug);
      if (!model) {
        throw new Error(`${upscaler.slug} was never resolved`);
      }

      console.log(`  [${upscaler.label}] upscaling (no background removal)...`);
      const upscaled = await upscale(imageUrl, upscaler, model, token);
      await writeFile(join(cellDir, "01-upscaled.png"), upscaled.upscaled);
      cell.upscale = {
        modelLabel: upscaler.label,
        path: relative("01-upscaled.png"),
        status: upscaled.run.prediction.status,
        wallClockMs: upscaled.run.wallClockMs,
        predictTimeSeconds: upscaled.run.predictTimeSeconds,
        width: upscaled.width,
        height: upscaled.height,
      };
      variantSource = upscaled.upscaled;
      console.log(
        `  [${upscaler.label}] upscaled to ${upscaled.width}x${upscaled.height}`
      );

      console.log(
        `  [${upscaler.label}] waiting 10s before the next Replicate request (rate limit)...`
      );
      await sleep(10_000);
    } else {
      console.log(
        `  [${upscaler.label}] skipping upscale: long edge already >= ${THRESHOLDS.upscaleMinLongEdge}px`
      );
    }

    const variants = await renderVariants(variantSource);
    await mkdir(join(cellDir, "variants"), { recursive: true });
    for (const variant of variants) {
      await writeFile(join(cellDir, "variants", variant.filename), variant.body);
      cell.variants.push({
        name: variant.name,
        format: variant.format,
        filename: relative(`variants/${variant.filename}`),
        width: variant.width,
        height: variant.height,
        sizeBytes: variant.body.length,
      });
    }
  } catch (error) {
    cell.error = error instanceof Error ? error.message : String(error);
    console.log(`  [${upscaler.label}] FAILED: ${cell.error}`);
  }

  return cell;
}

async function askWhatToRun(available: string[]): Promise<{
  images: string[];
  classifier: CandidateModel | null;
  backgroundRemovers: CandidateModel[];
  upscaler: CandidateModel | null;
  forceUpscale: boolean;
} | null> {
  const answers = await prompts(
    [
      {
        type: "multiselect",
        name: "images",
        message: "Which images?",
        instructions: false,
        hint: "space to toggle, enter to confirm",
        choices: available.map((filename) => {
          const sample = SAMPLE_IMAGES.find((s) => s.filename === filename);
          return {
            title: filename,
            description: sample?.tests ?? "your own image",
            value: filename,
            selected: false,
          };
        }),
      },
      {
        type: "multiselect",
        name: "backgroundRemovers",
        message:
          "Which background-removal models to compare? (leave empty to test upscaling on its own)",
        instructions: false,
        hint: "space to toggle, enter to confirm",
        choices: BACKGROUND_REMOVAL_CANDIDATES.map((candidate) => ({
          title: candidate.slug,
          description: candidate.notes,
          value: candidate,
          selected: false,
        })),
      },
      {
        type: "select",
        name: "upscaler",
        message: "Which upscale model?",
        choices: [
          ...UPSCALE_CANDIDATES.map((candidate) => ({
            title: candidate.slug,
            description: candidate.notes,
            value: candidate as CandidateModel | null,
          })),
          { title: "skip upscaling", description: "", value: null },
        ],
      },
      {
        type: "confirm",
        name: "forceUpscale",
        message: `Upscale every master, even when its long edge already clears ${THRESHOLDS.upscaleMinLongEdge}px?`,
        initial: false,
      },
      {
        type: "select",
        name: "classifier",
        message: "Run the CLEAN/KEEP classify stage?",
        choices: [
          {
            title: "skip (assume CLEAN)",
            description:
              "Background removal runs on every image. Costs nothing extra.",
            value: null as CandidateModel | null,
          },
          ...CLASSIFIER_CANDIDATES.map((candidate) => ({
            title: candidate.slug,
            description: candidate.notes,
            value: candidate as CandidateModel | null,
          })),
        ],
      },
    ],
    { onCancel: () => process.exit(0) }
  );

  const images: string[] = answers.images ?? [];
  const backgroundRemovers: CandidateModel[] = answers.backgroundRemovers ?? [];
  const upscaler: CandidateModel | null = answers.upscaler ?? null;
  if (images.length === 0 || (backgroundRemovers.length === 0 && !upscaler)) {
    return null;
  }

  const predictions =
    (backgroundRemovers.length > 0
      ? images.length * backgroundRemovers.length
      : upscaler
        ? images.length
        : 0) + (answers.classifier ? images.length : 0);
  const message =
    backgroundRemovers.length > 0
      ? `${images.length} image(s) x ${backgroundRemovers.length} model(s) = at least ${predictions} predictions, plus any upscales. Continue?`
      : `${images.length} image(s), upscale only (no background removal) = up to ${predictions} predictions. Continue?`;
  const { go } = await prompts({
    type: "confirm",
    name: "go",
    message,
    initial: true,
  });

  return go
    ? {
        images,
        classifier: answers.classifier ?? null,
        backgroundRemovers,
        upscaler,
        forceUpscale: answers.forceUpscale ?? false,
      }
    : null;
}

function describeModel(
  candidate: CandidateModel,
  model: ResolvedModel
): ModelRecord {
  const sent = [candidate.imageField, ...Object.keys(candidate.extraInput)];
  return {
    slug: candidate.slug,
    label: candidate.label,
    notes: candidate.notes,
    versionId: model.versionId,
    endpoint: model.versionId ? "version" : "model",
    inputFields: model.inputFields,
    requiredInputFields: model.requiredInputFields,
    unknownFieldsSent: model.inputFields.length
      ? sent.filter((field) => !model.inputFields.includes(field))
      : [],
  };
}

function reportSchema(candidate: CandidateModel, model: ResolvedModel): void {
  console.log(
    `  ${candidate.slug}: ${
      model.versionId
        ? `version ${model.versionId.slice(0, 12)}... via /predictions`
        : "no public version, via /models/{owner}/{name}/predictions"
    }`
  );
  if (model.inputFields.length > 0) {
    console.log(`      inputs: ${model.inputFields.join(", ")}`);
  }
  const unknown = describeModel(candidate, model).unknownFieldsSent;
  if (unknown.length > 0) {
    console.log(
      `      WARNING: this harness would send ${unknown.join(
        ", "
      )}, which this model does not declare - fix imageField/extraInput in config.ts`
    );
  }
}

async function listImages(): Promise<string[]> {
  const entries = await readdir(IMAGES_DIR).catch(() => [] as string[]);
  const present = entries
    .filter((name) => IMAGE_EXTENSIONS.includes(extname(name).toLowerCase()))
    .sort();
  const order = SAMPLE_IMAGES.map((s) => s.filename);
  return present.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
}

function formatRatio(ratio: number | null): string {
  return ratio === null ? "n/a" : ratio.toFixed(4);
}

function stem(filename: string): string {
  return basename(filename, extname(filename));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
