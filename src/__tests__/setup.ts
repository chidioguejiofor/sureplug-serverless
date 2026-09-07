process.env.AWS_REGION ||= "eu-west-2";
process.env.MEDIA_S3_BUCKET ||= "sureplug-media-test";
process.env.REPLICATE_API_TOKEN ||= "test-replicate-token";
process.env.BACKGROUND_REMOVAL_MODEL_VERSION ||= "test-model-version";
process.env.REMOVE_BACKGROUND_CALLBACK_BASE_URL ||=
  "https://callback.test.execute-api.eu-west-2.amazonaws.com";
process.env.REPLICATE_WEBHOOK_SECRET ||=
  Buffer.from("test-webhook-secret-key").toString("base64");
process.env.IMAGE_CLASSIFIER_MODEL_VERSION ||= "test-classifier-model-version";
process.env.CLASSIFY_IMAGE_CALLBACK_BASE_URL ||=
  "https://classify-callback.test.execute-api.eu-west-2.amazonaws.com";
process.env.UPSCALE_MODEL_VERSION ||= "test-upscale-model-version";
process.env.UPSCALE_CALLBACK_BASE_URL ||=
  "https://upscale-callback.test.execute-api.eu-west-2.amazonaws.com";
process.env.APP_INTERNAL_WEBHOOK_URL ||=
  "https://api.sureplug.test/api/media/internal/pipeline-result";
process.env.MEDIA_PIPELINE_WEBHOOK_SECRET ||= "test-pipeline-shared-secret";
