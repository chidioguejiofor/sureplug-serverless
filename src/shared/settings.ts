export const AWS_REGION = process.env.AWS_REGION || "eu-west-2";
export const MEDIA_S3_BUCKET = process.env.MEDIA_S3_BUCKET as string;
export const BLUR_SCORE_THRESHOLD = Number(
  process.env.BLUR_SCORE_THRESHOLD || 100
);
