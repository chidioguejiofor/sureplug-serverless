import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const sendMock = vi.hoisted(() => vi.fn());
const sendTaskSuccessMock = vi.hoisted(() =>
  vi.fn().mockImplementation((input) => ({ __type: "SendTaskSuccess", input }))
);
const sendTaskFailureMock = vi.hoisted(() =>
  vi.fn().mockImplementation((input) => ({ __type: "SendTaskFailure", input }))
);
vi.mock("@aws-sdk/client-sfn", () => {
  class FakeSFNClient {
    send = sendMock;
  }
  return {
    SFNClient: FakeSFNClient,
    SendTaskSuccessCommand: sendTaskSuccessMock,
    SendTaskFailureCommand: sendTaskFailureMock,
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
  } as unknown as Parameters<typeof handler>[0];
}

describe("remove-background-callback handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends task success with the output image URL on a succeeded prediction", async () => {
    const event = buildEvent({
      id: "pred-1",
      status: "succeeded",
      output: "https://replicate.delivery/output.png",
    });

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendTaskSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskToken: "task-token-abc" })
    );
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output)).toEqual({
      fileId: "file-1",
      outputImageUrl: "https://replicate.delivery/output.png",
    });
  });

  it("sends task failure on a failed prediction", async () => {
    const event = buildEvent({ id: "pred-1", status: "failed", error: "boom" });

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    expect(sendTaskFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskToken: "task-token-abc", cause: "boom" })
    );
  });

  it("rejects with 401 when the signature is invalid, without calling Step Functions", async () => {
    const event = buildEvent({
      id: "pred-1",
      status: "succeeded",
      output: "url",
    });
    event.headers["webhook-signature"] = "v1,dGFtcGVyZWQ=";

    const response = await handler(event);

    expect(response.statusCode).toEqual(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when taskToken is missing from the query string", async () => {
    const event = buildEvent(
      { id: "pred-1", status: "succeeded", output: "url" },
      { query: { fileId: "file-1", taskToken: undefined } }
    );

    const response = await handler(event);

    expect(response.statusCode).toEqual(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the webhook signature headers are missing", async () => {
    const event = buildEvent({ id: "pred-1", status: "succeeded", output: "url" });
    delete (event.headers as Record<string, string | undefined>)["webhook-signature"];

    const response = await handler(event);

    expect(response.statusCode).toEqual(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
