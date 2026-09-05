import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPrediction } from "../../shared/replicate-client";
import {
  AWS_REGION,
  REPLICATE_API_TOKEN,
  BACKGROUND_REMOVAL_MODEL_VERSION,
  REMOVE_BACKGROUND_CALLBACK_BASE_URL,
  SOURCE_IMAGE_URL_TTL_SECONDS,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });

export type RemoveBackgroundInput = {
  TaskToken: string;
  fileId: string;
  bucket: string;
  rawKey: string;
};

export function buildCallbackWebhookUrl(input: RemoveBackgroundInput): string {
  const url = new URL(
    "/webhooks/remove-background",
    REMOVE_BACKGROUND_CALLBACK_BASE_URL
  );
  url.searchParams.set("taskToken", input.TaskToken);
  url.searchParams.set("fileId", input.fileId);
  return url.toString();
}

export async function handler(input: RemoveBackgroundInput): Promise<void> {
  const sourceImageUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: input.bucket, Key: input.rawKey }),
    { expiresIn: SOURCE_IMAGE_URL_TTL_SECONDS }
  );

  await createPrediction(REPLICATE_API_TOKEN, {
    version: BACKGROUND_REMOVAL_MODEL_VERSION,
    input: { image: sourceImageUrl },
    webhook: buildCallbackWebhookUrl(input),
    webhookEventsFilter: ["completed"],
  });
}
