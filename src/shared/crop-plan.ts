import { MaskBounds } from "./mask-bounds";

export type CropPlan =
  | {
      outcome: "OK";
      crop: { left: number; top: number; width: number; height: number };
    }
  | {
      outcome: "NEEDS_REUPLOAD";
      reason: "no_product_detected" | "background_removal_failed";
    };

export function planCrop(
  bounds: MaskBounds | null,
  imageWidth: number,
  imageHeight: number,
  minCoverageRatio: number,
  maxCoverageRatio: number,
  paddingRatio: number
): CropPlan {
  if (!bounds || bounds.coverageRatio < minCoverageRatio) {
    return { outcome: "NEEDS_REUPLOAD", reason: "no_product_detected" };
  }
  if (bounds.coverageRatio > maxCoverageRatio) {
    return { outcome: "NEEDS_REUPLOAD", reason: "background_removal_failed" };
  }

  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const paddingX = Math.round(boxWidth * paddingRatio);
  const paddingY = Math.round(boxHeight * paddingRatio);

  const left = Math.max(0, bounds.minX - paddingX);
  const top = Math.max(0, bounds.minY - paddingY);
  const right = Math.min(imageWidth, bounds.maxX + 1 + paddingX);
  const bottom = Math.min(imageHeight, bounds.maxY + 1 + paddingY);

  return {
    outcome: "OK",
    crop: { left, top, width: right - left, height: bottom - top },
  };
}
