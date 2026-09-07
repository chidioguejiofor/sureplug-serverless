import { describe, it, expect } from "vitest";
import { computeContactShadowGeometry } from "../contact-shadow";

describe("computeContactShadowGeometry", () => {
  it("centers the shadow horizontally on the subject and anchors it near the bottom edge", () => {
    const geometry = computeContactShadowGeometry(
      { minX: 10, minY: 10, maxX: 89, maxY: 109 },
      0.7,
      0.1,
      0.35,
      0.28
    );

    // box: 80 wide (10..89), 100 tall (10..109)
    expect(geometry.centerX).toEqual(50); // (10+89+1)/2
    expect(geometry.radiusX).toEqual(28); // 80*0.7/2
    expect(geometry.radiusY).toEqual(5); // 100*0.1/2
    expect(geometry.centerY).toEqual(107.5); // maxY+1 - radiusY*0.5 = 110 - 2.5
    expect(geometry.blurStdDeviation).toEqual(1.75); // radiusY*0.35
    expect(geometry.opacity).toEqual(0.28);
  });

  it("never produces a zero or negative vertical radius for a very thin subject", () => {
    const geometry = computeContactShadowGeometry(
      { minX: 0, minY: 0, maxX: 9, maxY: 0 },
      0.7,
      0.1,
      0.35,
      0.28
    );

    expect(geometry.radiusY).toBeGreaterThanOrEqual(1);
  });
});
