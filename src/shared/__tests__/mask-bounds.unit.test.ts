import { describe, it, expect } from "vitest";
import { computeMaskBounds } from "../mask-bounds";

function alphaBuffer(
  width: number,
  height: number,
  opaqueRegion?: { x0: number; y0: number; x1: number; y1: number }
): Uint8Array {
  const buffer = new Uint8Array(width * height);
  if (opaqueRegion) {
    for (let y = opaqueRegion.y0; y <= opaqueRegion.y1; y++) {
      for (let x = opaqueRegion.x0; x <= opaqueRegion.x1; x++) {
        buffer[y * width + x] = 255;
      }
    }
  }
  return buffer;
}

describe("computeMaskBounds", () => {
  it("returns null when nothing is above the alpha threshold", () => {
    const alpha = alphaBuffer(10, 10);
    expect(computeMaskBounds(alpha, 10, 10)).toBeNull();
  });

  it("computes the bounding box and coverage ratio of the opaque region", () => {
    const alpha = alphaBuffer(10, 10, { x0: 2, y0: 3, x1: 5, y1: 6 });

    const bounds = computeMaskBounds(alpha, 10, 10);

    expect(bounds).toEqual({
      minX: 2,
      minY: 3,
      maxX: 5,
      maxY: 6,
      coverageRatio: 16 / 100,
    });
  });

  it("ignores pixels at or below the alpha threshold", () => {
    const alpha = new Uint8Array(100).fill(5);
    expect(computeMaskBounds(alpha, 10, 10, 10)).toBeNull();
  });
});
