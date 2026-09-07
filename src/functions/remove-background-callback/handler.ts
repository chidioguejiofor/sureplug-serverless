import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { parseReplicateWebhookRequest } from "../../shared/replicate-webhook-request";
import {
  resolveReplicateOutcome,
  ReplicatePredictionPayload,
} from "../../shared/replicate-outcome";
import { AWS_REGION, REPLICATE_WEBHOOK_SECRET } from "../../shared/settings";

const sfn = new SFNClient({ region: AWS_REGION });

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, body: JSON.stringify(body) };
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
  const { fileId, keyPrefix } = queryParams;
  if (!fileId || !keyPrefix) {
    return jsonResponse(400, { message: "Missing fileId or keyPrefix" });
  }

  const outcome = resolveReplicateOutcome(payload);

  if (outcome.kind === "SUCCESS") {
    await sfn.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({
          fileId,
          keyPrefix,
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
