import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { composeOntoNeutralBackground } from "../../shared/compose-on-neutral-background";
import {
  AWS_REGION,
  MEDIA_S3_BUCKET,
  NEUTRAL_BACKGROUND_COLOR,
  UPSCALE_MIN_LONG_EDGE,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type ComposeMasterInput = {
  fileId: string;
  keyPrefix: string;
  cutoutKey: string;
};

export type ComposeMasterOutput = {
  fileId: string;
  keyPrefix: string;
  masterKey: string;
  width: number;
  height: number;
  needsUpscale: boolean;
};

export async function handler(
  event: ComposeMasterInput
): Promise<ComposeMasterOutput> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: MEDIA_S3_BUCKET, Key: event.cutoutKey })
  );
  const bytes = await object.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Could not read object body for ${event.cutoutKey}`);
  }

  const master = await composeOntoNeutralBackground(
    Buffer.from(bytes),
    NEUTRAL_BACKGROUND_COLOR
  );
  const meta = await sharp(master).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const masterKey = `${event.keyPrefix}/${event.fileId}/master.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_S3_BUCKET,
      Key: masterKey,
      Body: master,
      ContentType: "image/png",
    })
  );

  return {
    fileId: event.fileId,
    keyPrefix: event.keyPrefix,
    masterKey,
    width,
    height,
    needsUpscale: Math.max(width, height) < UPSCALE_MIN_LONG_EDGE,
  };
}
