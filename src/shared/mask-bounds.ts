export type MaskBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  coverageRatio: number;
};

export function computeMaskBounds(
  alpha: Uint8Array | Buffer,
  width: number,
  height: number,
  alphaThreshold = 10
): MaskBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = alpha[y * width + x];
      if (value > alphaThreshold) {
        opaquePixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    coverageRatio: opaquePixelCount / (width * height),
  };
}
