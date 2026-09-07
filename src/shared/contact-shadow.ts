import { MaskBounds } from "./mask-bounds";

export type ShadowGeometry = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  blurStdDeviation: number;
  opacity: number;
};

export function computeContactShadowGeometry(
  bounds: Pick<MaskBounds, "minX" | "minY" | "maxX" | "maxY">,
  widthRatio: number,
  heightRatio: number,
  blurRatio: number,
  opacity: number
): ShadowGeometry {
  const boxWidth = bounds.maxX - bounds.minX + 1;
  const boxHeight = bounds.maxY - bounds.minY + 1;
  const radiusX = (boxWidth * widthRatio) / 2;
  const radiusY = Math.max(1, (boxHeight * heightRatio) / 2);

  return {
    centerX: (bounds.minX + bounds.maxX + 1) / 2,
    centerY: bounds.maxY + 1 - radiusY * 0.5,
    radiusX,
    radiusY,
    blurStdDeviation: radiusY * blurRatio,
    opacity,
  };
}
