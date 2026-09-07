import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyReplicateWebhook } from "../replicate-webhook";

const secret = Buffer.from("test-secret-key").toString("base64");

function sign(id: string, timestamp: string, body: string): string {
  const signedContent = `${id}.${timestamp}.${body}`;
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(signedContent)
    .digest("base64");
  return `v1,${signature}`;
}

describe("verifyReplicateWebhook", () => {
  it("accepts a validly signed payload within the timestamp window", () => {
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ status: "succeeded" });

    const result = verifyReplicateWebhook(
      { id, timestamp, signature: sign(id, timestamp, body) },
      body,
      secret
    );

    expect(result).toBe(true);
  });

  it("accepts when one of several space-delimited signatures matches", () => {
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ status: "succeeded" });
    const validSignature = sign(id, timestamp, body);

    const result = verifyReplicateWebhook(
      { id, timestamp, signature: `v1,not-the-right-sig ${validSignature}` },
      body,
      secret
    );

    expect(result).toBe(true);
  });

  it("rejects a tampered body", () => {
    const id = "msg_123";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(
      id,
      timestamp,
      JSON.stringify({ status: "succeeded" })
    );

    const result = verifyReplicateWebhook(
      { id, timestamp, signature },
      JSON.stringify({ status: "failed" }),
      secret
    );

    expect(result).toBe(false);
  });

  it("rejects a timestamp outside the allowed skew", () => {
    const id = "msg_123";
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
    const body = JSON.stringify({ status: "succeeded" });

    const result = verifyReplicateWebhook(
      { id, timestamp: staleTimestamp, signature: sign(id, staleTimestamp, body) },
      body,
      secret
    );

    expect(result).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    const result = verifyReplicateWebhook(
      { id: "msg_123", timestamp: "not-a-number", signature: "v1,abc" },
      "{}",
      secret
    );

    expect(result).toBe(false);
  });
});
