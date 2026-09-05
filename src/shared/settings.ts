export const AWS_REGION = process.env.AWS_REGION || "eu-west-2";
export const MEDIA_S3_BUCKET = process.env.MEDIA_S3_BUCKET as string;
export const BLUR_SCORE_THRESHOLD = Number(
  process.env.BLUR_SCORE_THRESHOLD || 100
);

export const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN as string;
export const BACKGROUND_REMOVAL_MODEL_VERSION = process.env
  .BACKGROUND_REMOVAL_MODEL_VERSION as string;
export const REMOVE_BACKGROUND_CALLBACK_BASE_URL = process.env
  .REMOVE_BACKGROUND_CALLBACK_BASE_URL as string;
export const SOURCE_IMAGE_URL_TTL_SECONDS = Number(
  process.env.SOURCE_IMAGE_URL_TTL_SECONDS || 900
);
export const REPLICATE_WEBHOOK_SECRET = process.env
  .REPLICATE_WEBHOOK_SECRET as string;
