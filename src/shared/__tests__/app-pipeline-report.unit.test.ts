import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportPipelineResult } from "../app-pipeline-report";

describe("reportPipelineResult", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the report with the shared-secret header", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await reportPipelineResult(
      "https://api.sureplug.test/api/media/internal/pipeline-result",
      "shared-secret-value",
      {
        fileId: "file-1",
        outcome: "READY",
        variants: [
          {
            name: "ORIGINAL",
            format: "WEBP",
            storageKey: "merchants/m1/product_images/file-1/original.webp",
            width: 2000,
            height: 1500,
            sizeBytes: 812000,
          },
        ],
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sureplug.test/api/media/internal/pipeline-result",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Media-Pipeline-Secret": "shared-secret-value",
        }),
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      fileId: "file-1",
      outcome: "READY",
      variants: [
        {
          name: "ORIGINAL",
          format: "WEBP",
          storageKey: "merchants/m1/product_images/file-1/original.webp",
          width: 2000,
          height: 1500,
          sizeBytes: 812000,
        },
      ],
    });
  });

  it("sends the NEEDS_REUPLOAD shape with a reason", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await reportPipelineResult("https://api.sureplug.test/hook", "secret", {
      fileId: "file-2",
      outcome: "NEEDS_REUPLOAD",
      reason: "too_blurry",
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      fileId: "file-2",
      outcome: "NEEDS_REUPLOAD",
      reason: "too_blurry",
    });
  });

  it("throws with the response body when the app rejects the report", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 })
    );

    await expect(
      reportPipelineResult("https://api.sureplug.test/hook", "wrong-secret", {
        fileId: "file-3",
        outcome: "NEEDS_REUPLOAD",
        reason: "no_product_detected",
      })
    ).rejects.toThrow(/401/);
  });
});
