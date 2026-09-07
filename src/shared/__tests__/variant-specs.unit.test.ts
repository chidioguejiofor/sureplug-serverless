import { describe, it, expect } from "vitest";
import { planVariantSize } from "../variant-specs";

describe("planVariantSize", () => {
  it("scales a landscape image so its long edge matches the target", () => {
    expect(planVariantSize(2000, 1000, 600)).toEqual({ width: 600, height: 300 });
  });

  it("scales a portrait image so its long edge matches the target", () => {
    expect(planVariantSize(1000, 2000, 600)).toEqual({ width: 300, height: 600 });
  });

  it("never enlarges an image already smaller than the target", () => {
    expect(planVariantSize(400, 250, 600)).toEqual({ width: 400, height: 250 });
  });

  it("leaves an image exactly at the target size unchanged", () => {
    expect(planVariantSize(600, 450, 600)).toEqual({ width: 600, height: 450 });
  });

  it("rounds fractional dimensions", () => {
    expect(planVariantSize(1001, 333, 300)).toEqual({ width: 300, height: 100 });
  });
});
