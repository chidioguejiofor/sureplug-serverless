import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { parseReplicateWebhookRequest } from "../replicate-webhook-request";

const secret = Buffer.from("test-secret-key").toString("base64");

function sign(id: string, timestamp: string, body: string): string {
  const signedContent = `${id}.${timestamp}.${body}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(signedContent)
    .digest("base64");
  return `v1,${signature}`;
}

function buildEvent(
  payload: Record<string, unknown>,
  overrides: {
    headers?: Record<string, string>;
    query?: Record<string, string | undefined>;
  } = {}
) {
  const rawBody = JSON.stringify(payload);
  const id = "msg_123";
  const timestamp = String(Math.floor(Date.now() / 1000));

  return {
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": sign(id, timestamp, rawBody),
      ...overrides.headers,
    },
    queryStringParameters: {
      taskToken: "task-token-abc",
      fileId: "file-1",
      ...overrides.query,
    },
    body: rawBody,
    isBase64Encoded: false,
  } as unknown as Parameters<typeof parseReplicateWebhookRequest>[0];
}

describe("parseReplicateWebhookRequest", () => {
  it("returns the task token, every query param, and the parsed body on a valid request", () => {
    const event = buildEvent({ status: "succeeded" }, { query: { keyPrefix: "p" } });

    const result = parseReplicateWebhookRequest(event, secret);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskToken).toEqual("task-token-abc");
      expect(result.queryParams).toEqual({
        taskToken: "task-token-abc",
        fileId: "file-1",
        keyPrefix: "p",
      });
      expect(result.payload).toEqual({ status: "succeeded" });
    }
  });

  it("returns 400 when taskToken is missing", () => {
    const event = buildEvent({ status: "succeeded" }, { query: { taskToken: undefined } });

    const result = parseReplicateWebhookRequest(event, secret);

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      message: "Missing taskToken",
    });
  });

  it("returns 400 when signature headers are missing", () => {
    const event = buildEvent({ status: "succeeded" });
    delete (event.headers as Record<string, string | undefined>)[
      "webhook-signature"
    ];

    const result = parseReplicateWebhookRequest(event, secret);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toEqual(400);
  });

  it("returns 401 when the signature is invalid", () => {
    const event = buildEvent({ status: "succeeded" });
    event.headers["webhook-signature"] = "v1,dGFtcGVyZWQ=";

    const result = parseReplicateWebhookRequest(event, secret);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toEqual(401);
  });
});
