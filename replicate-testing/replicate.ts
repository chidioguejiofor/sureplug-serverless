import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ReplicatePredictionPayload } from "../src/shared/replicate-outcome";

const REPLICATE_API = "https://api.replicate.com/v1";
const SYNCHRONOUS_WAIT_SECONDS = 60;
const POLL_INTERVAL_MS = 2000;
const PREDICTION_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_STATUSES = ["succeeded", "failed", "canceled"];

export type ResolvedModel = {
  slug: string;
  versionId: string | null;
  inputFields: string[];
  requiredInputFields: string[];
};

export type PredictionRun = {
  prediction: ReplicatePredictionPayload;
  endpoint: "version" | "model";
  wallClockMs: number;
  predictTimeSeconds: number | null;
};

type PollablePrediction = ReplicatePredictionPayload & {
  metrics?: { predict_time?: number };
};

async function callApi(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(`${REPLICATE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });

  if (!response.ok) {
    throw new Error(
      `Replicate ${init.method ?? "GET"} ${path} failed: ${
        response.status
      } ${await response.text()}`
    );
  }

  return response.json();
}

export async function resolveModel(
  slug: string,
  token: string
): Promise<ResolvedModel> {
  const model = (await callApi(`/models/${slug}`, token)) as {
    latest_version?: {
      id?: string;
      openapi_schema?: {
        components?: {
          schemas?: {
            Input?: {
              properties?: Record<string, unknown>;
              required?: string[];
            };
          };
        };
      };
    };
  };

  const inputSchema = model.latest_version?.openapi_schema?.components?.schemas
    ?.Input;

  return {
    slug,
    versionId: model.latest_version?.id ?? null,
    inputFields: Object.keys(inputSchema?.properties ?? {}),
    requiredInputFields: inputSchema?.required ?? [],
  };
}

export async function uploadImage(
  imagePath: string,
  token: string
): Promise<string> {
  return uploadBytes(await readFile(imagePath), basename(imagePath), token);
}

export async function uploadBytes(
  bytes: Buffer,
  filename: string,
  token: string
): Promise<string> {
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(bytes)]), filename);

  const file = (await callApi("/files", token, {
    method: "POST",
    body: form,
  })) as { urls?: { get?: string } };

  const url = file.urls?.get;
  if (!url) {
    throw new Error(
      `Replicate accepted the upload of ${filename} but returned no retrieval URL`
    );
  }
  return url;
}

export async function runPrediction(
  model: ResolvedModel,
  input: Record<string, unknown>,
  token: string
): Promise<PredictionRun> {
  const startedAt = Date.now();
  const usesVersion = model.versionId !== null;

  const submitted = (await callApi(
    usesVersion ? "/predictions" : `/models/${model.slug}/predictions`,
    token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: `wait=${SYNCHRONOUS_WAIT_SECONDS}`,
      },
      body: JSON.stringify(
        usesVersion ? { version: model.versionId, input } : { input }
      ),
    }
  )) as PollablePrediction;

  const prediction = await waitForTerminalState(submitted, token);

  return {
    prediction,
    endpoint: usesVersion ? "version" : "model",
    wallClockMs: Date.now() - startedAt,
    predictTimeSeconds: prediction.metrics?.predict_time ?? null,
  };
}

export async function downloadOutput(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not download prediction output: ${response.status} ${url}`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function waitForTerminalState(
  prediction: PollablePrediction,
  token: string
): Promise<PollablePrediction> {
  const deadline = Date.now() + PREDICTION_TIMEOUT_MS;
  let current = prediction;

  while (!TERMINAL_STATUSES.includes(current.status)) {
    if (Date.now() > deadline) {
      throw new Error(
        `Prediction ${current.id} still "${current.status}" after ${
          PREDICTION_TIMEOUT_MS / 1000
        }s`
      );
    }
    await sleep(POLL_INTERVAL_MS);
    current = (await callApi(
      `/predictions/${current.id}`,
      token
    )) as PollablePrediction;
  }

  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
