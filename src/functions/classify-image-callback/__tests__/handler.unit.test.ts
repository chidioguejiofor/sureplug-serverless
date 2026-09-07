import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const sendMock = vi.hoisted(() => vi.fn());
const sendTaskSuccessMock = vi.hoisted(() =>
  vi.fn().mockImplementation((input) => ({ __type: "SendTaskSuccess", input }))
);
vi.mock("@aws-sdk/client-sfn", () => {
  class FakeSFNClient {
    send = sendMock;
  }
  return {
    SFNClient: FakeSFNClient,
    SendTaskSuccessCommand: sendTaskSuccessMock,
  };
});

import { handler } from "../handler";

const secret = process.env.REPLICATE_WEBHOOK_SECRET as string;

function sign(id: string, timestamp: string, body: string): string {
  const signedContent = `${id}.${timestamp}.${body}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(signedContent)
    .digest("base64");
  return `v1,${signature}`;
}

function buildEvent(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const id = "msg_123";
  const timestamp = String(Math.floor(Date.now() / 1000));

  return {
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": sign(id, timestamp, rawBody),
    },
    queryStringParameters: {
      taskToken: "task-token-abc",
      fileId: "file-1",
      keyPrefix: "merchants/merchant-1/product_images",
      bucket: "sureplug-media-test",
      rawKey: "merchants/merchant-1/product_images/file-1/raw.jpg",
    },
    body: rawBody,
    isBase64Encoded: false,
  } as unknown as Parameters<typeof handler>[0];
}

describe("classify-image-callback handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends task success with needsBackgroundRemoval true for a CLEAN classification", async () => {
    const event = buildEvent({ status: "succeeded", output: "CLEAN" });

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(commandInput.taskToken).toEqual("task-token-abc");
    expect(JSON.parse(commandInput.output)).toEqual({
      fileId: "file-1",
      bucket: "sureplug-media-test",
      keyPrefix: "merchants/merchant-1/product_images",
      rawKey: "merchants/merchant-1/product_images/file-1/raw.jpg",
      needsBackgroundRemoval: true,
    });
  });

  it("sends task success with needsBackgroundRemoval false for a KEEP classification", async () => {
    const event = buildEvent({ status: "succeeded", output: "KEEP" });

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output).needsBackgroundRemoval).toBe(false);
  });

  it("still sends task success (never task failure) when the prediction itself failed", async () => {
    const event = buildEvent({ status: "failed", error: "model error" });

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    expect(sendTaskSuccessMock).toHaveBeenCalledTimes(1);
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output).needsBackgroundRemoval).toBe(false);
  });

  it("returns 401 for an invalid signature without calling Step Functions", async () => {
    const event = buildEvent({ status: "succeeded", output: "CLEAN" });
    event.headers["webhook-signature"] = "v1,dGFtcGVyZWQ=";

    const response = await handler(event);

    expect(response.statusCode).toEqual(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when bucket or rawKey is missing from the query string", async () => {
    const event = buildEvent({ status: "succeeded", output: "CLEAN" });
    delete (event.queryStringParameters as Record<string, string>).rawKey;

    const response = await handler(event);

    expect(response.statusCode).toEqual(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
