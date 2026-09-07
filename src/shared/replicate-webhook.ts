import { createHmac, timingSafeEqual } from "crypto";

export type ReplicateWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export function verifyReplicateWebhook(
  headers: ReplicateWebhookHeaders,
  rawBody: string,
  secret: string,
  now: Date = new Date()
): boolean {
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const skewSeconds = Math.abs(now.getTime() / 1000 - timestampSeconds);
  if (skewSeconds > MAX_TIMESTAMP_SKEW_SECONDS) {
    return false;
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expectedSignature = createHmac(
    "sha256",
    Buffer.from(secret, "base64")
  )
    .update(signedContent)
    .digest("base64");
  const expectedBuffer = Buffer.from(expectedSignature, "base64");

  const providedSignatures = headers.signature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((value): value is string => Boolean(value));

  return providedSignatures.some((provided) => {
    const providedBuffer = Buffer.from(provided, "base64");
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, expectedBuffer);
  });
}
