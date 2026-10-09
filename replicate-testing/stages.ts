import sharp from "sharp";
import { computeBlurScore } from "../src/shared/blur-score";
import { computeMaskBounds, MaskBounds } from "../src/shared/mask-bounds";
import { planCrop, CropPlan } from "../src/shared/crop-plan";
import { composeOntoNeutralBackground } from "../src/shared/compose-on-neutral-background";
import {
  VARIANT_SPECS,
  ORIGINAL_MASTER_WEBP_QUALITY,
  planVariantSize,
} from "../src/shared/variant-specs";
import {
  CLASSIFICATION_PROMPT,
  ImageClassification,
  resolveImageClassification,
} from "../src/shared/image-classification";
import { resolveReplicateOutcome } from "../src/shared/replicate-outcome";
import {
  downloadOutput,
  PredictionRun,
  ResolvedModel,
  runPrediction,
} from "./replicate";
import { CandidateModel, THRESHOLDS } from "./config";

export type ClassifyResult = {
  classification: ImageClassification;
  rawOutput: string;
  run: PredictionRun;
};

export type BlurCheckResult = {
  blurScore: number;
  isBlurry: boolean;
};

export type RemoveBackgroundResult = {
  cutout: Buffer;
  outputImageUrl: string;
  run: PredictionRun;
};

export type CropSubjectResult = {
  hasAlphaChannel: boolean;
  bounds: MaskBounds | null;
  plan: CropPlan;
  cropped: Buffer | null;
  width: number;
  height: number;
};

export type ComposeMasterResult = {
  master: Buffer;
  width: number;
  height: number;
  needsUpscale: boolean;
};

export type UpscaleResult = {
  upscaled: Buffer;
  width: number;
  height: number;
  run: PredictionRun;
};

export type RenderedVariant = {
  name: "ORIGINAL" | "THUMB" | "CARD" | "ZOOM";
  format: "WEBP" | "JPEG";
  filename: string;
  body: Buffer;
  width: number;
  height: number;
};

export async function classify(
  imageUrl: string,
  candidate: CandidateModel,
  model: ResolvedModel,
  token: string
): Promise<ClassifyResult> {
  const run = await runPrediction(
    model,
    {
      [candidate.imageField]: imageUrl,
      prompt: CLASSIFICATION_PROMPT,
      ...candidate.extraInput,
    },
    token
  );

  const output = run.prediction.output;
  return {
    classification: resolveImageClassification(run.prediction),
    rawOutput: Array.isArray(output)
      ? output.join("")
      : String(output ?? ""),
    run,
  };
}

export async function blurCheck(image: Buffer): Promise<BlurCheckResult> {
  const { data, info } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurScore = computeBlurScore(data, info.width, info.height);
  return { blurScore, isBlurry: blurScore < THRESHOLDS.blurScore };
}

export async function removeBackground(
  imageUrl: string,
  candidate: CandidateModel,
  model: ResolvedModel,
  token: string
): Promise<RemoveBackgroundResult> {
  const run = await runPrediction(
    model,
    { [candidate.imageField]: imageUrl, ...candidate.extraInput },
    token
  );

  const outcome = resolveReplicateOutcome(run.prediction);
  if (outcome.kind === "FAILURE") {
    throw new Error(`${candidate.slug} background removal failed: ${outcome.cause}`);
  }

  return {
    cutout: await downloadOutput(outcome.outputImageUrl),
    outputImageUrl: outcome.outputImageUrl,
    run,
  };
}

export async function cropSubject(cutout: Buffer): Promise<CropSubjectResult> {
  const metadata = await sharp(cutout).metadata();

  const { data: alpha, info } = await sharp(cutout)
    .clone()
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = computeMaskBounds(alpha, info.width, info.height);
  const plan = planCrop(
    bounds,
    info.width,
    info.height,
    THRESHOLDS.minSubjectCoverageRatio,
    THRESHOLDS.maxSubjectCoverageRatio,
    THRESHOLDS.cropPaddingRatio
  );

  if (plan.outcome === "NEEDS_REUPLOAD") {
    return {
      hasAlphaChannel: metadata.hasAlpha === true,
      bounds,
      plan,
      cropped: null,
      width: 0,
      height: 0,
    };
  }

  return {
    hasAlphaChannel: metadata.hasAlpha === true,
    bounds,
    plan,
    cropped: await sharp(cutout)
      .ensureAlpha()
      .extract(plan.crop)
      .png()
      .toBuffer(),
    width: plan.crop.width,
    height: plan.crop.height,
  };
}

export async function composeMaster(
  cropped: Buffer
): Promise<ComposeMasterResult> {
  const master = await composeOntoNeutralBackground(
    cropped,
    THRESHOLDS.neutralBackgroundColor
  );
  const metadata = await sharp(master).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  return {
    master,
    width,
    height,
    needsUpscale: Math.max(width, height) < THRESHOLDS.upscaleMinLongEdge,
  };
}

export async function upscale(
  masterUrl: string,
  candidate: CandidateModel,
  model: ResolvedModel,
  token: string
): Promise<UpscaleResult> {
  const run = await runPrediction(
    model,
    { [candidate.imageField]: masterUrl, ...candidate.extraInput },
    token
  );

  const outcome = resolveReplicateOutcome(run.prediction);
  if (outcome.kind === "FAILURE") {
    throw new Error(`${candidate.slug} upscale failed: ${outcome.cause}`);
  }

  const upscaled = await sharp(await downloadOutput(outcome.outputImageUrl))
    .flatten({ background: THRESHOLDS.neutralBackgroundColor })
    .png()
    .toBuffer();
  const metadata = await sharp(upscaled).metadata();

  return {
    upscaled,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    run,
  };
}

export async function renderVariants(
  source: Buffer
): Promise<RenderedVariant[]> {
  const master = await sharp(source).rotate().png().toBuffer();
  const metadata = await sharp(master).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const original: RenderedVariant = {
    name: "ORIGINAL",
    format: "WEBP",
    filename: "original.webp",
    body: await sharp(master)
      .webp({ quality: ORIGINAL_MASTER_WEBP_QUALITY })
      .toBuffer(),
    width,
    height,
  };

  const sized = await Promise.all(
    VARIANT_SPECS.flatMap((spec) =>
      (["WEBP", "JPEG"] as const).map(async (format) => {
        const size = planVariantSize(width, height, spec.longEdge);
        const resized = sharp(master).resize(spec.longEdge, spec.longEdge, {
          fit: "inside",
          withoutEnlargement: true,
        });
        const isWebp = format === "WEBP";
        return {
          name: spec.name,
          format,
          filename: `${spec.name.toLowerCase()}.${isWebp ? "webp" : "jpg"}`,
          body: await (isWebp
            ? resized.webp({ quality: spec.webpQuality })
            : resized.jpeg({ quality: spec.jpegQuality })
          ).toBuffer(),
          width: size.width,
          height: size.height,
        } satisfies RenderedVariant;
      })
    )
  );

  return [original, ...sized];
}
