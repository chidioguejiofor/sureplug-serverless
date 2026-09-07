export type ReportedVariant = {
  name: "ORIGINAL" | "THUMB" | "CARD" | "ZOOM";
  format: "WEBP" | "JPEG";
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type PipelineReport =
  | { fileId: string; outcome: "READY"; variants: ReportedVariant[] }
  | { fileId: string; outcome: "NEEDS_REUPLOAD"; reason: string };

export async function reportPipelineResult(
  url: string,
  secret: string,
  report: PipelineReport
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Media-Pipeline-Secret": secret,
    },
    body: JSON.stringify(report),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Pipeline result report failed: ${response.status} ${body}`
    );
  }
}
