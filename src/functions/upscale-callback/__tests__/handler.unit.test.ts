import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import sharp from "sharp";

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

const s3SendMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>(
    "@aws-sdk/client-s3"
  );
  class FakeS3Client {
    send = s3SendMock;
  }
  return { ...actual, S3Client: FakeS3Client };
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
  overrides: { query?: Record<string, string | undefined> } = {}
) {
  const rawBody = JSON.stringify(payload);
  const id = "msg_1";
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
      masterKey: "merchants/merchant-1/product_images/file-1/master.png",
      ...overrides.query,
    },
    body: rawBody,
    isBase64Encoded: false,
  } as unknown as Parameters<typeof handler>[0];
}

describe("upscale-callback handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3SendMock.mockResolvedValue({});
  });

  it("overwrites the master with the upscaled image and reports upscaled:true", async () => {
    const upscaledPng = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(upscaledPng, { status: 200 })
    );

    const response = await handler(
      buildEvent({
        id: "pred-1",
        status: "succeeded",
        output: "https://replicate.delivery/upscaled.png",
      })
    );

    expect(response.statusCode).toEqual(200);
    const putCall = s3SendMock.mock.calls.find(
      ([c]) => c.constructor.name === "PutObjectCommand"
    );
    expect(putCall?.[0].input.Key).toEqual(
      "merchants/merchant-1/product_images/file-1/master.png"
    );
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output)).toEqual({
      fileId: "file-1",
      keyPrefix: "merchants/merchant-1/product_images",
      masterKey: "merchants/merchant-1/product_images/file-1/master.png",
      upscaled: true,
    });
  });

  it("proceeds with the un-upscaled master when the prediction failed", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const response = await handler(
      buildEvent({ id: "pred-1", status: "failed", error: "boom" })
    );

    expect(response.statusCode).toEqual(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(s3SendMock).not.toHaveBeenCalled();
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output).upscaled).toBe(false);
  });

  it("proceeds with the un-upscaled master when downloading the output fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("nope", { status: 500 })
    );

    const response = await handler(
      buildEvent({
        id: "pred-1",
        status: "succeeded",
        output: "https://replicate.delivery/upscaled.png",
      })
    );

    expect(response.statusCode).toEqual(200);
    const [[commandInput]] = sendTaskSuccessMock.mock.calls;
    expect(JSON.parse(commandInput.output).upscaled).toBe(false);
  });

  it("rejects an invalid signature without calling Step Functions", async () => {
    const event = buildEvent({ id: "pred-1", status: "succeeded", output: "u" });
    event.headers["webhook-signature"] = "v1,dGFtcGVyZWQ=";

    const response = await handler(event);

    expect(response.statusCode).toEqual(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when masterKey is missing from the query string", async () => {
    const response = await handler(
      buildEvent(
        { id: "pred-1", status: "succeeded", output: "u" },
        { query: { masterKey: undefined } }
      )
    );

    expect(response.statusCode).toEqual(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
