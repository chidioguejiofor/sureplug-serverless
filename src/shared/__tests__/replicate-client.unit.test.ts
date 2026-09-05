import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrediction } from "../replicate-client";

describe("createPrediction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to Replicate's predictions endpoint with the expected shape", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "pred-1", status: "starting" }), {
          status: 201,
        })
      );

    const result = await createPrediction("token-abc", {
      version: "model-version-1",
      input: { image: "https://example.test/source.jpg" },
      webhook: "https://example.test/callback",
      webhookEventsFilter: ["completed"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc",
        }),
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit?.body as string);
    expect(body).toEqual({
      version: "model-version-1",
      input: { image: "https://example.test/source.jpg" },
      webhook: "https://example.test/callback",
      webhook_events_filter: ["completed"],
    });
    expect(result).toEqual({ id: "pred-1", status: "starting" });
  });

  it("throws with the response body when Replicate returns an error status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("bad request details", { status: 400 })
    );

    await expect(
      createPrediction("token-abc", {
        version: "model-version-1",
        input: {},
        webhook: "https://example.test/callback",
        webhookEventsFilter: ["completed"],
      })
    ).rejects.toThrow(/400/);
  });
});
