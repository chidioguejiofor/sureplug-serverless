import { describe, it, expect } from "vitest";
import { buildTaskWebhookUrl } from "../webhook-task-url";

describe("buildTaskWebhookUrl", () => {
  it("appends every param as a query string entry on the given path", () => {
    const url = buildTaskWebhookUrl(
      "https://callback.example.test",
      "/webhooks/classify-image",
      { taskToken: "task-1", fileId: "file-1", keyPrefix: "merchants/m1/product_images" }
    );

    const parsed = new URL(url);
    expect(parsed.pathname).toEqual("/webhooks/classify-image");
    expect(parsed.searchParams.get("taskToken")).toEqual("task-1");
    expect(parsed.searchParams.get("fileId")).toEqual("file-1");
    expect(parsed.searchParams.get("keyPrefix")).toEqual(
      "merchants/m1/product_images"
    );
  });
});
