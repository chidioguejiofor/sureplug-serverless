import { describe, it, expect, vi, beforeEach } from "vitest";

const getSignedUrlMock = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

const createPredictionMock = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/replicate-client", () => ({
  createPrediction: createPredictionMock,
}));

import { handler, buildClassifyCallbackWebhookUrl } from "../handler";

const input = {
  TaskToken: "task-token-abc",
  fileId: "file-1",
  bucket: "sureplug-media-test",
  keyPrefix: "merchants/merchant-1/product_images",
  rawKey: "merchants/merchant-1/product_images/file-1/raw.jpg",
};

describe("buildClassifyCallbackWebhookUrl", () => {
  it("embeds the task token, fileId, keyPrefix, bucket and rawKey as query params", () => {
    const url = new URL(buildClassifyCallbackWebhookUrl(input));

    expect(url.pathname).toEqual("/webhooks/classify-image");
    expect(url.searchParams.get("taskToken")).toEqual("task-token-abc");
    expect(url.searchParams.get("fileId")).toEqual("file-1");
    expect(url.searchParams.get("keyPrefix")).toEqual(
      "merchants/merchant-1/product_images"
    );
    expect(url.searchParams.get("bucket")).toEqual("sureplug-media-test");
    expect(url.searchParams.get("rawKey")).toEqual(input.rawKey);
  });
});

describe("classify-image handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presigns the raw object and submits a classification prediction with a prompt", async () => {
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
        input: expect.objectContaining({
          image: "https://s3.example.test/signed-source",
        }),
        webhookEventsFilter: ["completed"],
      })
    );

    const call = createPredictionMock.mock.calls[0][1];
    expect(call.input.prompt).toContain("CLEAN");
    expect(call.input.prompt).toContain("KEEP");
    expect(call.webhook).toContain("taskToken=task-token-abc");
  });

  it("propagates a Replicate submission failure so Step Functions fails fast", async () => {
    getSignedUrlMock.mockResolvedValueOnce(
      "https://s3.example.test/signed-source"
    );
    createPredictionMock.mockRejectedValueOnce(new Error("Replicate is down"));

    await expect(handler(input)).rejects.toThrow("Replicate is down");
  });
});
