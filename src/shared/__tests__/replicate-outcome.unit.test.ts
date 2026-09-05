import { describe, it, expect } from "vitest";
import { resolveReplicateOutcome } from "../replicate-outcome";

describe("resolveReplicateOutcome", () => {
  it("returns SUCCESS with the output URL for a succeeded prediction", () => {
    const result = resolveReplicateOutcome({
      id: "pred-1",
      status: "succeeded",
      output: "https://replicate.delivery/output.png",
    });

    expect(result).toEqual({
      kind: "SUCCESS",
      outputImageUrl: "https://replicate.delivery/output.png",
    });
  });

  it("takes the first element when output is an array", () => {
    const result = resolveReplicateOutcome({
      id: "pred-1",
      status: "succeeded",
      output: [
        "https://replicate.delivery/output.png",
        "https://replicate.delivery/mask.png",
      ],
    });

    expect(result).toEqual({
      kind: "SUCCESS",
      outputImageUrl: "https://replicate.delivery/output.png",
    });
  });

  it("returns FAILURE using Replicate's own error message when the prediction failed", () => {
    const result = resolveReplicateOutcome({
      id: "pred-1",
      status: "failed",
      error: "CUDA out of memory",
    });

    expect(result).toEqual({ kind: "FAILURE", cause: "CUDA out of memory" });
  });

  it("returns FAILURE with a generic cause when there is no error message", () => {
    const result = resolveReplicateOutcome({ id: "pred-1", status: "canceled" });

    expect(result).toEqual({
      kind: "FAILURE",
      cause: 'Replicate prediction ended with status "canceled"',
    });
  });

  it("returns FAILURE when status is succeeded but there is no usable output", () => {
    const result = resolveReplicateOutcome({
      id: "pred-1",
      status: "succeeded",
      output: undefined,
    });

    expect(result.kind).toEqual("FAILURE");
  });
});
