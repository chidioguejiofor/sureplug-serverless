import { CropPlan } from "../src/shared/crop-plan";
import { ImageClassification } from "../src/shared/image-classification";

export type ModelRecord = {
  slug: string;
  label: string;
  notes: string;
  versionId: string | null;
  endpoint: "version" | "model";
  inputFields: string[];
  requiredInputFields: string[];
  unknownFieldsSent: string[];
};

export type PredictionRecord = {
  status: string;
  wallClockMs: number;
  predictTimeSeconds: number | null;
};

export type VariantRecord = {
  name: string;
  format: string;
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type CellRecord = {
  modelLabel: string;
  modelSlug: string;
  error: string | null;
  removeBackground: PredictionRecord | null;
  cutoutPath: string | null;
  hasAlphaChannel: boolean | null;
  coverageRatio: number | null;
  cropPlan: CropPlan | null;
  croppedPath: string | null;
  masterPath: string | null;
  masterWidth: number | null;
  masterHeight: number | null;
  needsUpscale: boolean | null;
  upscale: (PredictionRecord & {
    modelLabel: string;
    path: string;
    width: number;
    height: number;
  }) | null;
  variants: VariantRecord[];
};

export type ImageRecord = {
  filename: string;
  tests: string;
  expectedClassification: ImageClassification | null;
  originalPath: string;
  width: number;
  height: number;
  blurScore: number;
  isBlurry: boolean;
  classification: ImageClassification | null;
  classificationRaw: string | null;
  classificationModelLabel: string | null;
  cells: CellRecord[];
};

export type RunRecord = {
  runId: string;
  startedAt: string;
  thresholds: Record<string, string | number>;
  models: ModelRecord[];
  images: ImageRecord[];
};
