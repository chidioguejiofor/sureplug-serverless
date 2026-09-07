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

export const IMAGE_CLASSIFIER_MODEL_VERSION = process.env
  .IMAGE_CLASSIFIER_MODEL_VERSION as string;
export const CLASSIFY_IMAGE_CALLBACK_BASE_URL = process.env
  .CLASSIFY_IMAGE_CALLBACK_BASE_URL as string;

export const NEUTRAL_BACKGROUND_COLOR =
  process.env.NEUTRAL_BACKGROUND_COLOR || "#FAFAFA";
export const MIN_SUBJECT_COVERAGE_RATIO = Number(
  process.env.MIN_SUBJECT_COVERAGE_RATIO || 0.02
);
export const MAX_SUBJECT_COVERAGE_RATIO = Number(
  process.env.MAX_SUBJECT_COVERAGE_RATIO || 0.98
);
export const CROP_PADDING_RATIO = Number(
  process.env.CROP_PADDING_RATIO || 0.05
);
export const CONTACT_SHADOW_WIDTH_RATIO = Number(
  process.env.CONTACT_SHADOW_WIDTH_RATIO || 0.7
);
export const CONTACT_SHADOW_HEIGHT_RATIO = Number(
  process.env.CONTACT_SHADOW_HEIGHT_RATIO || 0.1
);
export const CONTACT_SHADOW_BLUR_RATIO = Number(
  process.env.CONTACT_SHADOW_BLUR_RATIO || 0.35
);
export const CONTACT_SHADOW_OPACITY = Number(
  process.env.CONTACT_SHADOW_OPACITY || 0.28
);

export const APP_INTERNAL_WEBHOOK_URL = process.env
  .APP_INTERNAL_WEBHOOK_URL as string;
export const MEDIA_PIPELINE_WEBHOOK_SECRET = process.env
  .MEDIA_PIPELINE_WEBHOOK_SECRET as string;
