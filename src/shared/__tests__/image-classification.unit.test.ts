import { describe, it, expect } from "vitest";
import { resolveImageClassification } from "../image-classification";

describe("resolveImageClassification", () => {
  it("returns CLEAN when the model unambiguously says so", () => {
    expect(
      resolveImageClassification({ status: "succeeded", output: "CLEAN" })
    ).toEqual("CLEAN");
  });

  it("is case-insensitive and tolerates surrounding whitespace/punctuation", () => {
    expect(
      resolveImageClassification({ status: "succeeded", output: " clean.\n" })
    ).toEqual("CLEAN");
  });

  it("handles an array output, as some Replicate models stream token arrays", () => {
    expect(
      resolveImageClassification({ status: "succeeded", output: ["CLEAN"] })
    ).toEqual("CLEAN");
  });

  it("defaults to KEEP when the response mentions both words", () => {
    expect(
      resolveImageClassification({
        status: "succeeded",
        output: "This could be CLEAN or KEEP",
      })
    ).toEqual("KEEP");
  });

  it("defaults to KEEP when the response is unparseable", () => {
    expect(
      resolveImageClassification({ status: "succeeded", output: "I'm not sure" })
    ).toEqual("KEEP");
  });

  it("defaults to KEEP when there is no output at all", () => {
    expect(resolveImageClassification({ status: "succeeded" })).toEqual(
      "KEEP"
    );
  });

  it("defaults to KEEP when the prediction did not succeed, regardless of output", () => {
    expect(
      resolveImageClassification({ status: "failed", output: "CLEAN" })
    ).toEqual("KEEP");
  });
});
