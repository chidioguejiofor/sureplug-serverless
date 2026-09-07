import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPrediction } from "../../shared/replicate-client";
import { buildTaskWebhookUrl } from "../../shared/webhook-task-url";
import {
  AWS_REGION,
  MEDIA_S3_BUCKET,
  REPLICATE_API_TOKEN,
  UPSCALE_MODEL_VERSION,
  UPSCALE_CALLBACK_BASE_URL,
  UPSCALE_FACTOR,
  SOURCE_IMAGE_URL_TTL_SECONDS,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type UpscaleInput = {
  TaskToken: string;
  fileId: string;
  keyPrefix: string;
  masterKey: string;
};

export function buildCallbackWebhookUrl(input: UpscaleInput): string {
  return buildTaskWebhookUrl(UPSCALE_CALLBACK_BASE_URL, "/webhooks/upscale", {
    taskToken: input.TaskToken,
    fileId: input.fileId,
    keyPrefix: input.keyPrefix,
    masterKey: input.masterKey,
  });
}

export async function handler(input: UpscaleInput): Promise<void> {
  const sourceImageUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: MEDIA_S3_BUCKET, Key: input.masterKey }),
    { expiresIn: SOURCE_IMAGE_URL_TTL_SECONDS }
  );

  await createPrediction(REPLICATE_API_TOKEN, {
    version: UPSCALE_MODEL_VERSION,
    input: { image: sourceImageUrl, scale: UPSCALE_FACTOR },
    webhook: buildCallbackWebhookUrl(input),
    webhookEventsFilter: ["completed"],
  });
}
