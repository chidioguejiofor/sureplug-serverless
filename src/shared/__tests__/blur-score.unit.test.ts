import { describe, it, expect } from "vitest";
import { computeBlurScore } from "../blur-score";

function uniformImage(width: number, height: number, value: number): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

function checkerboardImage(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = (x + y) % 2 === 0 ? 255 : 0;
    }
  }
  return pixels;
}

describe("computeBlurScore", () => {
  it("returns 0 for a perfectly uniform image", () => {
    const pixels = uniformImage(10, 10, 128);
    expect(computeBlurScore(pixels, 10, 10)).toEqual(0);
  });

  it("returns a high score for a sharp, high-contrast pattern", () => {
    const pixels = checkerboardImage(10, 10);
    expect(computeBlurScore(pixels, 10, 10)).toBeGreaterThan(1000);
  });

  it("returns a lower score for a slightly softened version of the same pattern", () => {
    const sharpPixels = checkerboardImage(10, 10);
    const softenedPixels = new Uint8Array(sharpPixels.length);
    for (let i = 0; i < sharpPixels.length; i++) {
      softenedPixels[i] = sharpPixels[i] > 127 ? 200 : 55;
    }

    const sharpScore = computeBlurScore(sharpPixels, 10, 10);
    const softenedScore = computeBlurScore(softenedPixels, 10, 10);

    expect(softenedScore).toBeLessThan(sharpScore);
  });

  it("throws for images too small to convolve", () => {
    expect(() => computeBlurScore(uniformImage(2, 2, 0), 2, 2)).toThrow();
  });
});
