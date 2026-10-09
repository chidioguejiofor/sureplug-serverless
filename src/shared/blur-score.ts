export function computeBlurScore(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number
): number {
  if (width < 3 || height < 3) {
    throw new Error(
      `Image too small to compute a blur score (${width}x${height}, need at least 3x3)`
    );
  }

  let responseCount = 0;
  let mean = 0;
  let sumOfSquaredDeviations = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const response =
        -4 * pixels[idx] +
        pixels[idx - 1] +
        pixels[idx + 1] +
        pixels[idx - width] +
        pixels[idx + width];

      responseCount++;
      const deviationFromPreviousMean = response - mean;
      mean += deviationFromPreviousMean / responseCount;
      sumOfSquaredDeviations += deviationFromPreviousMean * (response - mean);
    }
  }

  return sumOfSquaredDeviations / responseCount;
}
