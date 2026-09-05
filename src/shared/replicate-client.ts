export type CreatePredictionInput = {
  version: string;
  input: Record<string, unknown>;
  webhook: string;
  webhookEventsFilter: string[];
};

export type Prediction = {
  id: string;
  status: string;
};

export async function createPrediction(
  apiToken: string,
  request: CreatePredictionInput
): Promise<Prediction> {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: request.version,
      input: request.input,
      webhook: request.webhook,
      webhook_events_filter: request.webhookEventsFilter,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Replicate createPrediction failed: ${response.status} ${body}`
    );
  }

  const data = (await response.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
}
