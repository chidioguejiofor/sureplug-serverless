import { APIGatewayProxyEventV2 } from "aws-lambda";
import { verifyReplicateWebhook } from "./replicate-webhook";

export type ParsedReplicateWebhookRequest<T> =
  | {
      ok: true;
      taskToken: string;
      queryParams: Record<string, string>;
      payload: T;
    }
  | { ok: false; statusCode: number; message: string };

function getHeader(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name
  );
  return key ? headers[key] : undefined;
}

export function parseReplicateWebhookRequest<T>(
  event: APIGatewayProxyEventV2,
  secret: string
): ParsedReplicateWebhookRequest<T> {
  const queryParams = (event.queryStringParameters ?? {}) as Record<
    string,
    string
  >;
  const taskToken = queryParams.taskToken;
  if (!taskToken) {
    return { ok: false, statusCode: 400, message: "Missing taskToken" };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  const webhookId = getHeader(event.headers, "webhook-id");
  const webhookTimestamp = getHeader(event.headers, "webhook-timestamp");
  const webhookSignature = getHeader(event.headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missing webhook signature headers",
    };
  }

  const verified = verifyReplicateWebhook(
    { id: webhookId, timestamp: webhookTimestamp, signature: webhookSignature },
    rawBody,
    secret
  );
  if (!verified) {
    return { ok: false, statusCode: 401, message: "Invalid webhook signature" };
  }

  return {
    ok: true,
    taskToken,
    queryParams,
    payload: JSON.parse(rawBody) as T,
  };
}
