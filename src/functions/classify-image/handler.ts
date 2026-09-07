import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPrediction } from "../../shared/replicate-client";
import { buildTaskWebhookUrl } from "../../shared/webhook-task-url";
import { CLASSIFICATION_PROMPT } from "../../shared/image-classification";
import {
  AWS_REGION,
  REPLICATE_API_TOKEN,
  IMAGE_CLASSIFIER_MODEL_VERSION,
  CLASSIFY_IMAGE_CALLBACK_BASE_URL,
  SOURCE_IMAGE_URL_TTL_SECONDS,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type ClassifyImageInput = {
  TaskToken: string;
  fileId: string;
  bucket: string;
  keyPrefix: string;
  rawKey: string;
};

export function buildClassifyCallbackWebhookUrl(
  input: ClassifyImageInput
): string {
  return buildTaskWebhookUrl(
    CLASSIFY_IMAGE_CALLBACK_BASE_URL,
    "/webhooks/classify-image",
    {
      taskToken: input.TaskToken,
      fileId: input.fileId,
      keyPrefix: input.keyPrefix,
      bucket: input.bucket,
      rawKey: input.rawKey,
    }
  );
}

export async function handler(input: ClassifyImageInput): Promise<void> {
  const sourceImageUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: input.bucket, Key: input.rawKey }),
    { expiresIn: SOURCE_IMAGE_URL_TTL_SECONDS }
  );

  await createPrediction(REPLICATE_API_TOKEN, {
    version: IMAGE_CLASSIFIER_MODEL_VERSION,
    input: { image: sourceImageUrl, prompt: CLASSIFICATION_PROMPT },
    webhook: buildClassifyCallbackWebhookUrl(input),
    webhookEventsFilter: ["completed"],
  });
}
