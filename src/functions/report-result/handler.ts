import {
  APP_INTERNAL_WEBHOOK_URL,
  MEDIA_PIPELINE_WEBHOOK_SECRET,
} from "../../shared/settings";
import {
  reportPipelineResult,
  PipelineReport,
} from "../../shared/app-pipeline-report";

export type ReportResultInput = PipelineReport;

export async function handler(
  event: ReportResultInput
): Promise<{ reported: true }> {
  await reportPipelineResult(
    APP_INTERNAL_WEBHOOK_URL,
    MEDIA_PIPELINE_WEBHOOK_SECRET,
    event
  );
  return { reported: true };
}
