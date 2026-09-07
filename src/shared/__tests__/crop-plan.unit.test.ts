import { describe, it, expect } from "vitest";
import { planCrop } from "../crop-plan";

const bounds = { minX: 10, minY: 10, maxX: 89, maxY: 89, coverageRatio: 0.5 };

describe("planCrop", () => {
  it("returns NEEDS_REUPLOAD (no_product_detected) when there are no mask bounds at all", () => {
    const plan = planCrop(null, 100, 100, 0.02, 0.98, 0.05);
    expect(plan).toEqual({
      outcome: "NEEDS_REUPLOAD",
      reason: "no_product_detected",
    });
  });

  it("returns NEEDS_REUPLOAD (no_product_detected) when coverage is below the minimum", () => {
    const plan = planCrop(
      { ...bounds, coverageRatio: 0.001 },
      100,
      100,
      0.02,
      0.98,
      0.05
    );
    expect(plan).toEqual({
      outcome: "NEEDS_REUPLOAD",
      reason: "no_product_detected",
    });
  });

  it("returns NEEDS_REUPLOAD (background_removal_failed) when coverage is above the maximum", () => {
    const plan = planCrop(
      { ...bounds, coverageRatio: 0.99 },
      100,
      100,
      0.02,
      0.98,
      0.05
    );
    expect(plan).toEqual({
      outcome: "NEEDS_REUPLOAD",
      reason: "background_removal_failed",
    });
  });

  it("returns an OK crop rect padded around the bounds, clamped to image edges", () => {
    const plan = planCrop(bounds, 100, 100, 0.02, 0.98, 0.05);

    expect(plan.outcome).toEqual("OK");
    if (plan.outcome === "OK") {
      expect(plan.crop).toEqual({ left: 6, top: 6, width: 88, height: 88 });
    }
  });

  it("clamps the crop rect to the image bounds when padding would overflow", () => {
    const edgeBounds = { minX: 0, minY: 0, maxX: 99, maxY: 99, coverageRatio: 0.5 };
    const plan = planCrop(edgeBounds, 100, 100, 0.02, 0.98, 0.05);

    expect(plan.outcome).toEqual("OK");
    if (plan.outcome === "OK") {
      expect(plan.crop).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    }
  });
});
