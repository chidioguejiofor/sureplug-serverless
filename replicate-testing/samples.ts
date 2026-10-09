export type SampleSource =
  | { kind: "download"; url: string; credit: string }
  | { kind: "derived"; from: string; transform: "downscale" | "blur" };

export type SampleImage = {
  filename: string;
  tests: string;
  expectedClassification: "CLEAN" | "KEEP";
  source: SampleSource;
};

export const DERIVED_DOWNSCALE_LONG_EDGE = 700;
export const DERIVED_BLUR_SIGMA = 3;

export const SAMPLE_IMAGES: SampleImage[] = [
  {
    filename: "01-clean-product-on-white.png",
    tests: "Baseline: single product on a plain white studio backdrop",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Oca-low-washed-black-contrast-thread-canvas-sneaker.png",
      credit: "Oca low canvas sneaker, Wikimedia Commons",
    },
  },
  {
    filename: "02-messy-real-world-surface.jpg",
    tests: "The realistic merchant upload: product on a wooden table, cluttered surroundings",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/7/75/Mug_of_Coffee_on_a_Wooden_Table_%2826804116318%29.jpg",
      credit: "Mug of Coffee on a Wooden Table, Wikimedia Commons",
    },
  },
  {
    filename: "03-fine-bristle-edges.jpg",
    tests: "Alpha quality on fine, hair-like edges (toothbrush bristles)",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Electric_toothbrush_on_a_white_background.jpg",
      credit: "Electric toothbrush on a white background, Wikimedia Commons",
    },
  },
  {
    filename: "04-transparent-reflective-glass.jpg",
    tests: "Classic matting failure: reflective glass perfume bottle, plus a second object in frame",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/d/d3/L%27Heure_Bleue_Perfume_Bottle_And_Box%2C_introduced_1912_%28CH_18401163%29.jpg",
      credit: "L'Heure Bleue perfume bottle and box, Cooper Hewitt via Wikimedia Commons",
    },
  },
  {
    filename: "05-near-white-on-white.jpg",
    tests: "Why the backdrop is #FAFAFA and not #FFFFFF: near-white product losing edge definition",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/1/14/Aged_ceramic_white_vase.jpg",
      credit: "Aged ceramic white vase, Wikimedia Commons",
    },
  },
  {
    filename: "06-dark-on-dark.jpg",
    tests: "Low-contrast segmentation: dark product against a dark background",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/4/46/Tango_shoes%2C_black_satin%2C_1910.jpg",
      credit: "Tango shoes, black satin, 1910, Wikimedia Commons",
    },
  },
  {
    filename: "07-multiple-products.jpg",
    tests: "Exercises MIN/MAX_SUBJECT_COVERAGE_RATIO: many objects spread across the frame",
    expectedClassification: "CLEAN",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/f/fd/Socket_set_with_two_ratchets_in_metal_box%2C_industrial_grade_quality%2C_on_white_background.jpg",
      credit: "Socket set with two ratchets, Wikimedia Commons",
    },
  },
  {
    filename: "08-marketing-graphic-with-text.jpg",
    tests: "Must classify KEEP and never be cut out: composed graphic with typography",
    expectedClassification: "KEEP",
    source: {
      kind: "download",
      url: "https://upload.wikimedia.org/wikipedia/commons/3/31/Edward_McKnight_Kauffer_-_Winter_Sale_at_Derry_%26_Toms%2C_1919.jpg",
      credit: "Edward McKnight Kauffer, Winter Sale at Derry & Toms (1919), Wikimedia Commons",
    },
  },
  {
    filename: "09-small-phone-crop.png",
    tests: `The only sample that reaches the Upscale stage: long edge forced under UPSCALE_MIN_LONG_EDGE (${DERIVED_DOWNSCALE_LONG_EDGE}px)`,
    expectedClassification: "CLEAN",
    source: {
      kind: "derived",
      from: "01-clean-product-on-white.png",
      transform: "downscale",
    },
  },
  {
    filename: "10-blurry-handheld.jpg",
    tests: `Calibrates BLUR_SCORE_THRESHOLD: sample 02 with a gaussian blur of sigma ${DERIVED_BLUR_SIGMA}`,
    expectedClassification: "CLEAN",
    source: {
      kind: "derived",
      from: "02-messy-real-world-surface.jpg",
      transform: "blur",
    },
  },
];
