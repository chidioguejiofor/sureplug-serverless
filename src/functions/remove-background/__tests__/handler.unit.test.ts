import { describe, it, expect, vi, beforeEach } from "vitest";

const getSignedUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

const createPredictionMock = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/replicate-client", () => ({
  createPrediction: createPredictionMock,
}));

import { handler, buildCallbackWebhookUrl } from "../handler";

const input = {
  TaskToken: "task-token-abc",
  fileId: "file-1",
  bucket: "sureplug-media-test",
  keyPrefix: "merchants/merchant-1/product_images",
  rawKey: "merchants/merchant-1/product_images/file-1/raw.jpg",
};

describe("buildCallbackWebhookUrl", () => {
  it("embeds the task token, fileId and keyPrefix as query params on the callback URL", () => {
    const url = buildCallbackWebhookUrl(input);

    expect(url).toContain("/webhooks/remove-background");
    expect(new URL(url).searchParams.get("taskToken")).toEqual(
      "task-token-abc"
    );
    expect(new URL(url).searchParams.get("fileId")).toEqual("file-1");
    expect(new URL(url).searchParams.get("keyPrefix")).toEqual(
      "merchants/merchant-1/product_images"
    );
  });
});

describe("remove-background handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presigns the raw object and submits a Replicate prediction with the callback webhook", async () => {
    getSignedUrlMock.mockResolvedValueOnce(
      "https://s3.example.test/signed-source"
    );
    createPredictionMock.mockResolvedValueOnce({
      id: "pred-1",
      status: "starting",
    });

    await handler(input);

    expect(createPredictionMock).toHaveBeenCalledWith(
      "test-replicate-token",
      expect.objectContaining({
        version: "test-model-version",
        input: { image: "https://s3.example.test/signed-source" },
        webhookEventsFilter: ["completed"],
      })
    );

    const call = createPredictionMock.mock.calls[0][1];
    expect(call.webhook).toContain("taskToken=task-token-abc");
    expect(call.webhook).toContain("fileId=file-1");
    expect(call.webhook).toContain(
      "keyPrefix=merchants%2Fmerchant-1%2Fproduct_images"
    );
  });

  it("propagates a Replicate submission failure so Step Functions fails fast", async () => {
    getSignedUrlMock.mockResolvedValueOnce(
      "https://s3.example.test/signed-source"
    );
    createPredictionMock.mockRejectedValueOnce(new Error("Replicate is down"));

    await expect(handler(input)).rejects.toThrow("Replicate is down");
  });
});
