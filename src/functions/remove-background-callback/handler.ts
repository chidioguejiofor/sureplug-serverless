import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { verifyReplicateWebhook } from "../../shared/replicate-webhook";
import {
  resolveReplicateOutcome,
  ReplicatePredictionPayload,
} from "../../shared/replicate-outcome";
import { AWS_REGION, REPLICATE_WEBHOOK_SECRET } from "../../shared/settings";

const sfn = new SFNClient({ region: AWS_REGION });

function getHeader(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name
  );
  return key ? headers[key] : undefined;
}

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, body: JSON.stringify(body) };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const taskToken = event.queryStringParameters?.taskToken;
  const fileId = event.queryStringParameters?.fileId;
  if (!taskToken || !fileId) {
    return jsonResponse(400, { message: "Missing taskToken or fileId" });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  const webhookId = getHeader(event.headers, "webhook-id");
  const webhookTimestamp = getHeader(event.headers, "webhook-timestamp");
  const webhookSignature = getHeader(event.headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return jsonResponse(400, {
      message: "Missing webhook signature headers",
    });
  }

  const verified = verifyReplicateWebhook(
    { id: webhookId, timestamp: webhookTimestamp, signature: webhookSignature },
    rawBody,
    REPLICATE_WEBHOOK_SECRET
  );
  if (!verified) {
    return jsonResponse(401, { message: "Invalid webhook signature" });
  }

  const prediction = JSON.parse(rawBody) as ReplicatePredictionPayload;
  const outcome = resolveReplicateOutcome(prediction);

  if (outcome.kind === "SUCCESS") {
    await sfn.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({
          fileId,
          outputImageUrl: outcome.outputImageUrl,
        }),
      })
    );
  } else {
    await sfn.send(
      new SendTaskFailureCommand({
        taskToken,
        error: "BackgroundRemovalFailed",
        cause: outcome.cause,
      })
    );
  }

  return jsonResponse(200, { received: true });
}
