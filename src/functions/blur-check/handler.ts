import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { computeBlurScore } from "../../shared/blur-score";
import { AWS_REGION, BLUR_SCORE_THRESHOLD } from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type BlurCheckInput = {
  fileId: string;
  bucket: string;
  keyPrefix: string;
  rawKey: string;
};

export type BlurCheckOutput = {
  fileId: string;
  bucket: string;
  keyPrefix: string;
  rawKey: string;
  blurScore: number;
  isBlurry: boolean;
};

export async function handler(
  event: BlurCheckInput
): Promise<BlurCheckOutput> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: event.bucket, Key: event.rawKey })
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Could not read object body for ${event.rawKey}`);
  }

  const { data, info } = await sharp(Buffer.from(bytes))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurScore = computeBlurScore(data, info.width, info.height);

  return {
    fileId: event.fileId,
    bucket: event.bucket,
    keyPrefix: event.keyPrefix,
    rawKey: event.rawKey,
    blurScore,
    isBlurry: blurScore < BLUR_SCORE_THRESHOLD,
  };
}
