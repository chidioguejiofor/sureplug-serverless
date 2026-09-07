import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import sharp from "sharp";
import { parseReplicateWebhookRequest } from "../../shared/replicate-webhook-request";
import {
  resolveReplicateOutcome,
  ReplicatePredictionPayload,
} from "../../shared/replicate-outcome";
import {
  AWS_REGION,
  MEDIA_S3_BUCKET,
  NEUTRAL_BACKGROUND_COLOR,
  REPLICATE_WEBHOOK_SECRET,
} from "../../shared/settings";

const s3 = new S3Client({ region: AWS_REGION });
const sfn = new SFNClient({ region: AWS_REGION });

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, body: JSON.stringify(body) };
}

async function replaceMasterWithUpscaled(
  masterKey: string,
  outputImageUrl: string
): Promise<void> {
  const response = await fetch(outputImageUrl);
  if (!response.ok) {
    throw new Error(`Could not download upscale output: ${response.status}`);
  }
  const upscaled = await sharp(Buffer.from(await response.arrayBuffer()))
    .flatten({ background: NEUTRAL_BACKGROUND_COLOR })
    .png()
    .toBuffer();

  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_S3_BUCKET,
      Key: masterKey,
      Body: upscaled,
      ContentType: "image/png",
    })
  );
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const parsed = parseReplicateWebhookRequest<ReplicatePredictionPayload>(
    event,
    REPLICATE_WEBHOOK_SECRET
  );
  if (!parsed.ok) {
    return jsonResponse(parsed.statusCode, { message: parsed.message });
  }

  const { taskToken, queryParams, payload } = parsed;
  const { fileId, keyPrefix, masterKey } = queryParams;
  if (!fileId || !keyPrefix || !masterKey) {
    return jsonResponse(400, {
      message: "Missing fileId, keyPrefix or masterKey",
    });
  }

  const outcome = resolveReplicateOutcome(payload);
  let upscaled = false;
  if (outcome.kind === "SUCCESS") {
    try {
      await replaceMasterWithUpscaled(masterKey, outcome.outputImageUrl);
      upscaled = true;
    } catch (error) {
      console.error("Upscale post-processing failed, keeping master", error);
    }
  } else {
    console.error("Upscale prediction failed, keeping master", outcome.cause);
  }

  await sfn.send(
    new SendTaskSuccessCommand({
      taskToken,
      output: JSON.stringify({ fileId, keyPrefix, masterKey, upscaled }),
    })
  );

  return jsonResponse(200, { received: true, upscaled });
}
