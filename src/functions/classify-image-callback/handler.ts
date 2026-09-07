import {
  SFNClient,
  SendTaskSuccessCommand,
} from "@aws-sdk/client-sfn";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { parseReplicateWebhookRequest } from "../../shared/replicate-webhook-request";
import { resolveImageClassification } from "../../shared/image-classification";
import { AWS_REGION, REPLICATE_WEBHOOK_SECRET } from "../../shared/settings";

const sfn = new SFNClient({ region: AWS_REGION });

type ClassificationPredictionPayload = {
  status: string;
  output?: unknown;
};

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, body: JSON.stringify(body) };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const parsed = parseReplicateWebhookRequest<ClassificationPredictionPayload>(
    event,
    REPLICATE_WEBHOOK_SECRET
  );
  if (!parsed.ok) {
    return jsonResponse(parsed.statusCode, { message: parsed.message });
  }

  const { taskToken, queryParams, payload } = parsed;
  const { fileId, keyPrefix, bucket, rawKey } = queryParams;
  if (!fileId || !keyPrefix || !bucket || !rawKey) {
    return jsonResponse(400, {
      message: "Missing fileId, keyPrefix, bucket or rawKey",
    });
  }

  const classification = resolveImageClassification(payload);

  await sfn.send(
    new SendTaskSuccessCommand({
      taskToken,
      output: JSON.stringify({
        fileId,
        bucket,
        keyPrefix,
        rawKey,
        needsBackgroundRemoval: classification === "CLEAN",
      }),
    })
  );

  return jsonResponse(200, { received: true });
}
