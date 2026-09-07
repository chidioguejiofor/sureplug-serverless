export type ImageClassification = "CLEAN" | "KEEP";

export const CLASSIFICATION_PROMPT =
  "Answer with exactly one word: CLEAN or KEEP. Say CLEAN if this image shows " +
  "a single physical product photographed against a plain, simple, or messy " +
  "real-world background that could be replaced with a neutral studio " +
  "backdrop. Say KEEP if this image is a marketing graphic, infographic, " +
  "multi-panel comparison, or a lifestyle/context scene with deliberate " +
  "composition, text overlays, branding, or graphic design that should not " +
  "have its background altered.";

export function resolveImageClassification(prediction: {
  status: string;
  output?: unknown;
}): ImageClassification {
  if (prediction.status !== "succeeded") {
    return "KEEP";
  }

  const text = Array.isArray(prediction.output)
    ? prediction.output.join(" ")
    : String(prediction.output ?? "");
  const normalized = text.trim().toUpperCase();

  if (normalized.includes("CLEAN") && !normalized.includes("KEEP")) {
    return "CLEAN";
  }
  return "KEEP";
}
