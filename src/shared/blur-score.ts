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

  const responses: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const value =
        -4 * pixels[idx] +
        pixels[idx - 1] +
        pixels[idx + 1] +
        pixels[idx - width] +
        pixels[idx + width];
      responses.push(value);
    }
  }

  const mean =
    responses.reduce((sum, value) => sum + value, 0) / responses.length;
  const variance =
    responses.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    responses.length;

  return variance;
}
