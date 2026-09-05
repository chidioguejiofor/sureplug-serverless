process.env.AWS_REGION ||= "eu-west-2";
process.env.MEDIA_S3_BUCKET ||= "sureplug-media-test";
process.env.REPLICATE_API_TOKEN ||= "test-replicate-token";
process.env.BACKGROUND_REMOVAL_MODEL_VERSION ||= "test-model-version";
process.env.REMOVE_BACKGROUND_CALLBACK_BASE_URL ||=
  "https://callback.test.execute-api.eu-west-2.amazonaws.com";
