export type ReplicatePredictionPayload = {
  id: string;
  status: string;
  output?: unknown;
  error?: string | null;
};

export type ReplicateOutcome =
  | { kind: "SUCCESS"; outputImageUrl: string }
  | { kind: "FAILURE"; cause: string };

export function resolveReplicateOutcome(
  prediction: ReplicatePredictionPayload
): ReplicateOutcome {
  if (prediction.status !== "succeeded") {
    return {
      kind: "FAILURE",
      cause:
        prediction.error ??
        `Replicate prediction ended with status "${prediction.status}"`,
    };
  }

  const outputImageUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (typeof outputImageUrl !== "string" || outputImageUrl.length === 0) {
    return {
      kind: "FAILURE",
      cause: "Replicate reported success but returned no output image URL",
    };
  }

  return { kind: "SUCCESS", outputImageUrl };
}
