# replicate-testing

A local harness for running the media pipeline on real images without deploying
anything, so we can pick the three Replicate models and replace the guessed
tuning constants with measured ones.

This whole folder is gitignored.

## Why it exists

Three env vars in `.env-example` still hold the literal placeholder
`<model-owner>/<model-name>:<version-hash>`:

- `BACKGROUND_REMOVAL_MODEL_VERSION`
- `UPSCALE_MODEL_VERSION`
- `IMAGE_CLASSIFIER_MODEL_VERSION`

and five tuning constants are documented there as unmeasured guesses:
`BLUR_SCORE_THRESHOLD`, `MIN_SUBJECT_COVERAGE_RATIO`,
`MAX_SUBJECT_COVERAGE_RATIO`, `UPSCALE_MIN_LONG_EDGE`, and the four
`CONTACT_SHADOW_*` ratios.

The deployed pipeline is webhook-driven (`invoke.waitForTaskToken` plus a
callback Lambda per stage), so there was no way to see one image through it
without a full deploy. This harness closes that loop locally.

## Usage

```bash
# once: put a real token in ../.env (REPLICATE_API_TOKEN)
npm run replicate:samples   # downloads 8 sample images, derives 2 more
npm run replicate:test      # the wizard
```

The wizard asks which images, which background-removal models to compare, which
upscaler, and whether to run the classify stage. It then writes every stage's
output to `results/<timestamp>/` along with a `report.html` comparing them
side by side, and a `run.json` with every number.

Start with one image and one model to confirm auth and the upload path before
running the full matrix.

## What is real and what is not

Every stage's logic is the actual production code, imported from `src/shared`:
`computeBlurScore`, `computeMaskBounds`, `planCrop`,
`composeOntoNeutralBackground`, `VARIANT_SPECS` / `planVariantSize`,
`CLASSIFICATION_PROMPT` / `resolveImageClassification`, and
`resolveReplicateOutcome`. Nothing in `src/` is modified or duplicated.

Exactly two things differ from the deployed pipeline:

| | production | here |
|---|---|---|
| Replicate result delivery | webhook to an HTTP API Lambda, Step Functions task token | `Prefer: wait` then poll `GET /predictions/{id}` |
| image storage | S3, handed to Replicate as a presigned GET URL | local files, uploaded via `POST /v1/files` |

`replicate.ts` also resolves each model's schema at runtime
(`GET /v1/models/{owner}/{name}`) rather than pinning a version hash, and
prints the input fields the model actually declares. That matters because
`src/shared/replicate-client.ts` only ever POSTs `/v1/predictions` with a
`version`, and official models have no public version hash at all — they need
`POST /v1/models/{owner}/{name}/predictions`. The report records which endpoint
each candidate required.

## The sample set

`samples.ts` holds the manifest. Eight are downloaded from Wikimedia Commons;
two are derived locally with sharp so the cases they test are reproducible
rather than dependent on finding exactly the right photo.

| # | tests |
|---|---|
| 01 | baseline: single product on a plain white backdrop |
| 02 | the realistic merchant upload: product on a wooden table |
| 03 | fine, hair-like edges (toothbrush bristles) |
| 04 | reflective glass, plus a second object in frame |
| 05 | near-white product on white — why the backdrop is `#FAFAFA` |
| 06 | dark product on a dark background |
| 07 | many objects — exercises the coverage ratios |
| 08 | composed graphic with typography — must classify `KEEP` |
| 09 | derived: downscaled under `UPSCALE_MIN_LONG_EDGE`, the only sample that reaches the Upscale stage |
| 10 | derived: sample 02 with a gaussian blur, to calibrate `BLUR_SCORE_THRESHOLD` |

Drop your own product photos into `images/` and they are picked up too, labelled
"your own image" in the report.

To widen the blur calibration, add more entries with
`source: { kind: "derived", from: "02-...", transform: "blur" }` and vary
`DERIVED_BLUR_SIGMA`.

## Findings

### Measured before spending anything on Replicate

`BLUR_SCORE_THRESHOLD=100` rejects 6 of the 10 samples, all of which are sharp.
Laplacian variance at native resolution:

| sample | score | verdict at threshold 100 |
|---|---|---|
| 01 clean product on white | 482.4 | ok |
| 02 messy real-world surface | 36.1 | **rejected, but sharp** |
| 03 fine bristle edges | 29.3 | **rejected, but sharp** |
| 04 reflective glass | 48.9 | **rejected, but sharp** |
| 05 near-white on white | 42.0 | **rejected, but sharp** |
| 06 dark on dark | 54.3 | **rejected, but sharp** |
| 07 multiple products | 371.9 | ok |
| 08 marketing graphic | 495.8 | ok |
| 09 small phone crop | 1171.8 | ok |
| 10 blurry (02 at sigma 3) | 2.5 | correctly rejected |

Blur sweep on five bases, native resolution:

| sigma | 0 | 0.5 | 1 | 1.5 | 2 | 3 | 5 |
|---|---|---|---|---|---|---|---|
| 01 | 482.4 | 482.4 | 71.4 | 20.9 | 8.3 | 2.8 | 1.3 |
| 02 | 36.1 | 36.1 | 4.6 | 2.3 | 1.8 | 1.6 | 1.5 |
| 03 | 29.3 | 29.3 | 4.7 | 2.4 | 1.5 | 0.8 | 0.5 |
| 05 | 42.0 | 42.0 | 5.4 | 2.3 | 1.4 | 0.9 | 0.6 |
| 06 | 54.3 | 54.3 | 11.3 | 4.3 | 2.6 | 1.6 | 1.0 |

Reading it:

- **Suggested value: `BLUR_SCORE_THRESHOLD=15`.** Every sharp sample scores at
  least 29.3, and everything at sigma >= 2 scores at most 8.3, so 15 sits with
  roughly 2x margin on both sides.
- The absolute score depends heavily on how much texture the subject has, not
  just on focus: sample 01 sharp is 482, sample 03 sharp is 29 — 16x apart, both
  in focus. So sample 01 blurred to sigma 1 (71.4) still outscores sample 03
  sharp (29.3). **No single global threshold separates mild blur from a
  low-texture subject.** 15 catches badly blurry uploads, which is what the
  "ask the merchant to re-upload" branch is for; it will not catch mild softness,
  and arguably should not.
- The score is also resolution-dependent, because it is computed over the raw
  upload at full size. Downscaling sample 01 to 700px takes it from 482 to 1172.
  If blur-check ever starts resizing first, recalibrate.

### `computeBlurScore` allocates one JS number per pixel

`src/shared/blur-score.ts` accumulates every Laplacian response into a
`responses: number[]` before computing the variance. On the 30MP sample that is
30.2M doubles:

- OOMs at `--max-old-space-size=256`
- needs ~392MB of heap to complete
- projects to ~864MB for a 108MP phone photo

`blurCheck` is the only sharp-using function in `serverless.yml` with no
`memorySize` (composeMaster and upscaleCallback are 1024, renderVariants 2048),
so it runs at the framework default. Today's samples fit; large phone uploads
would not. The variance can be computed in a single streaming pass with O(1)
memory, which fixes it without raising the Lambda's memory.

### Still to fill in from a real run

- Background-removal model chosen:
- Upscale model chosen:
- Classifier model chosen:
- `MIN_SUBJECT_COVERAGE_RATIO` / `MAX_SUBJECT_COVERAGE_RATIO`:
- `UPSCALE_MIN_LONG_EDGE`:
- Did any candidate need the `/models/{owner}/{name}/predictions` endpoint?
