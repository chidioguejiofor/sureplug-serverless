import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { computeMaskBounds } from "../../shared/mask-bounds";
import { planCrop } from "../../shared/crop-plan";
import {
  AWS_REGION,
  MEDIA_S3_BUCKET,
  MIN_SUBJECT_COVERAGE_RATIO,
  MAX_SUBJECT_COVERAGE_RATIO,
  CROP_PADDING_RATIO,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type CropSubjectInput = {
  fileId: string;
  keyPrefix: string;
  outputImageUrl: string;
};

export type CropSubjectOutput =
  | {
      fileId: string;
      keyPrefix: string;
      needsReupload: false;
      cutoutKey: string;
      width: number;
      height: number;
    }
  | {
      fileId: string;
      keyPrefix: string;
      needsReupload: true;
      reviewReason: string;
    };

export async function handler(
  event: CropSubjectInput
): Promise<CropSubjectOutput> {
  const response = await fetch(event.outputImageUrl);
  if (!response.ok) {
    throw new Error(
      `Could not download background-removal output: ${response.status}`
    );
  }
  const cutoutBytes = Buffer.from(await response.arrayBuffer());

  const { data: alpha, info } = await sharp(cutoutBytes)
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
    MIN_SUBJECT_COVERAGE_RATIO,
    MAX_SUBJECT_COVERAGE_RATIO,
    CROP_PADDING_RATIO
  );

  if (plan.outcome === "NEEDS_REUPLOAD") {
    return {
      fileId: event.fileId,
      keyPrefix: event.keyPrefix,
      needsReupload: true,
      reviewReason: plan.reason,
    };
  }

  const cropped = await sharp(cutoutBytes)
    .ensureAlpha()
    .extract(plan.crop)
    .png()
    .toBuffer();

  const cutoutKey = `${event.keyPrefix}/${event.fileId}/cutout.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_S3_BUCKET,
      Key: cutoutKey,
      Body: cropped,
      ContentType: "image/png",
    })
  );

  return {
    fileId: event.fileId,
    keyPrefix: event.keyPrefix,
    needsReupload: false,
    cutoutKey,
    width: plan.crop.width,
    height: plan.crop.height,
  };
}
