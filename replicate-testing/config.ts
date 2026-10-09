export type CandidateModel = {
  slug: string;
  label: string;
  notes: string;
  imageField: string;
  extraInput: Record<string, unknown>;
};

export const UPSCALE_FACTOR = Number(process.env.UPSCALE_FACTOR || 2);

export const THRESHOLDS = {
  blurScore: Number(process.env.BLUR_SCORE_THRESHOLD || 15),
  minSubjectCoverageRatio: Number(process.env.MIN_SUBJECT_COVERAGE_RATIO || 0.02),
  maxSubjectCoverageRatio: Number(process.env.MAX_SUBJECT_COVERAGE_RATIO || 0.98),
  cropPaddingRatio: Number(process.env.CROP_PADDING_RATIO || 0.05),
  upscaleMinLongEdge: Number(process.env.UPSCALE_MIN_LONG_EDGE || 1400),
  neutralBackgroundColor: process.env.NEUTRAL_BACKGROUND_COLOR || "#FAFAFA",
};

export const BACKGROUND_REMOVAL_CANDIDATES: CandidateModel[] = [
  {
    slug: "851-labs/background-remover",
    label: "851-labs",
    notes: "Highest-volume community pick, ~$0.0005/image. Has format/background_type inputs that decide whether the output keeps an alpha channel at all.",
    imageField: "image",
    extraInput: {},
  },
  {
    slug: "men1scus/birefnet",
    label: "birefnet",
    notes: "Best reported edge quality on hair, fur and semi-transparent fabric. Costs roughly 10x the 851-labs model.",
    imageField: "image",
    extraInput: {},
  },
  {
    slug: "bria/remove-background",
    label: "bria (official)",
    notes: "Official model, so it has no public version hash and must be invoked via the /models/{owner}/{name}/predictions endpoint. Trained only on licensed data.",
    imageField: "image",
    extraInput: {},
  },
];

export const UPSCALE_CANDIDATES: CandidateModel[] = [
  {
    slug: "nightmareai/real-esrgan",
    label: "real-esrgan",
    notes: `The only candidate matching the { image, scale } schema src/functions/upscale/handler.ts already assumes.`,
    imageField: "image",
    extraInput: { scale: UPSCALE_FACTOR },
  },
  {
    slug: "google/upscaler",
    label: "google (official)",
    notes: `Official model, and it names the scale input "upscale_factor" with values like "x2" rather than a numeric "scale" - the schema mismatch .env-example warns about.`,
    imageField: "image",
    extraInput: { upscale_factor: `x${UPSCALE_FACTOR}` },
  },
  {
    slug: "topazlabs/image-upscale",
    label: "topaz (official)",
    notes: "Official model from Topaz Labs. No public version hash, so it's invoked via /models/{owner}/{name}/predictions like bria and google. Input field names unconfirmed - resolveModel prints the real schema at run time and the harness warns if imageField/extraInput here don't match it.",
    imageField: "image",
    extraInput: {},
  },
];

export const CLASSIFIER_CANDIDATES: CandidateModel[] = [
  {
    slug: "yorickvp/llava-13b",
    label: "llava-13b",
    notes: "Vision-language model taking image + prompt, which is the schema src/functions/classify-image/handler.ts assumes.",
    imageField: "image",
    extraInput: {},
  },
];
