# sureplug-serverless

The product-image processing pipeline for SurePlug: background removal,
compositing onto a neutral background, cropping, conditional upscaling (not
yet built), rendering the size variants the storefront actually serves, and
reporting the outcome back to `sureplug-backend`. Runs as an AWS
Step Functions state machine backed by Lambda, deployed with the
[Serverless Framework](https://www.serverless.com/).

This is a separate deploy artifact from `sureplug-backend` on purpose - a
different runtime concern (image processing, external GPU-inference vendors)
and a different deploy lifecycle from the Express app. See
`sureplug-backend`'s `AGENTS.md` for the app side of this integration
(the `media` domain, its presigned-upload flow, and the
`POST /media/internal/pipeline-result` webhook this pipeline reports back to).

## Why this pipeline exists, and what it doesn't do

`sureplug-backend`'s `CompleteUploadUsecase` already runs cheap, synchronous
checks before anything reaches here: `HeadObject`-verifies the upload, and -
for any purpose where the verified bytes are JPEG/PNG - moderates it via
Rekognition. A product image only reaches this pipeline once that's already
passed, which is why there's no moderation stage here: it would be a second,
pointless remote call for a check already done, and it would mean paying for
this pipeline's own compute before a moderation-rejected image is turned
away.

What this pipeline actually does:

1. **ClassifyImage** - not every product image is a raw photo of a product
   against a messy background. Merchants also upload marketing graphics,
   infographics, and lifestyle/context shots that are already deliberately
   composed - running background removal on those would actively wreck them.
   A cheap Replicate vision-model call (same task-token/webhook pattern as
   `RemoveBackground`) answers "clean up this background, or keep it as
   composed" before anything else runs - see "Classifying which images need
   background removal" below.
2. **BlurCheck** - only reached for images the classifier says need cleanup;
   rejects too-blurry uploads before paying for the far more expensive
   background-removal stage.
3. **RemoveBackground** - a lean OSS segmentation model via a serverless-GPU
   host (Replicate), submitted with a webhook so the state machine doesn't
   poll (`.waitForTaskToken`: `removeBackground` submits the prediction and
   returns immediately; `removeBackgroundCallback`, invoked by Replicate's
   webhook via HTTP API, verifies the webhook signature and resolves the
   waiting Step Functions task with `SendTaskSuccess`/`SendTaskFailure`).
4. **CropSubject** - the background-removal output's alpha channel *is*
   the segmentation mask (no separate mask file for these models); its
   bounding box both sanity-checks that a real subject is present (too little
   opaque area -> `no_product_detected`, too much -> `background_removal_failed`,
   either routes to `NeedsReupload`) and drives the crop (bounding box + a
   configurable padding ratio, clamped to the image edges). The result stays a
   **transparent** cropped cutout, written to `cutout.png` under the file's
   own `{keyPrefix}/{fileId}/` folder - see "Why the master stays transparent"
   below for why this stage doesn't composite onto a background itself.
5. **Upscale** *(conditional, not yet implemented)* - only when the cropped
   image's long edge is below a quality threshold.
6. **RenderVariants** - produces `original.webp` (the served master, WebP
   q92) plus `thumb`/`card`/`zoom` in both WebP and JPEG, for *both* paths.
   The CLEAN path composites `cutout.png` onto the neutral background +
   contact shadow (`composeOntoNeutralBackground`) to get the opaque master;
   the KEEP path just auto-orients the raw upload (no compositing - the
   image's own background *is* the content). Both then encode the master to
   WebP and resize into the fixed size set. The served master is WebP, not
   PNG, on purpose: the KEEP path's raw upload is often a photographic JPEG
   (marketing graphic, lifestyle shot) and re-encoding that to PNG bloats it
   5-10x for no gain - the lossless re-derivation sources are `cutout.png`
   (CLEAN) and the retained `raw.*` (both), never `original.*`. Every
   serving-facing asset is opaque; `cutout.png` is the only thing that stays
   transparent. Returns a manifest of every variant
   (name/format/key/dimensions/bytes) for `ReportResult`.
7. **ReportResult** - calls `sureplug-backend`'s
   `POST /media/internal/pipeline-result` with the outcome (`READY` + the
   rendered variant manifest, or `NEEDS_REUPLOAD` + a reason -
   `too_blurry` / `no_product_detected` / `background_removal_failed`),
   authenticated with the `X-Media-Pipeline-Secret` shared-secret header
   (`MEDIA_PIPELINE_WEBHOOK_SECRET`, must match the backend's value). Every
   terminal branch - both render paths, the blur rejection, and the crop
   rejection - routes through a `reportResult` Task (with a `States.ALL`
   retry/backoff so a transient network blip doesn't strand a finished
   execution) before the single `PipelineComplete` success state. The
   backend usecase is a no-op unless the file is still `PROCESSING`, so
   retries and duplicate deliveries are safe.

## RemoveBackground correlation & webhook verification

Step Functions' `.waitForTaskToken` pattern needs the eventual webhook call to
carry back the task token for the specific execution it belongs to.
`removeBackground` embeds it (plus `fileId`) as query params on the callback
URL it hands Replicate as the `webhook`. **This assumes Replicate calls back
the URL exactly as given, query string included** - their docs confirm the
call is a POST to "that URL" but don't explicitly confirm query-string
preservation. Worth a real sandbox test before trusting this in production;
if it turns out otherwise, the fallback is encoding the token into the URL
*path* instead (`/webhooks/remove-background/<taskToken>`), which is
unambiguously preserved.

`removeBackgroundCallback` verifies every inbound call is genuinely from
Replicate before trusting it (`replicate-webhook.ts`) - HMAC-SHA256 over
`{webhook-id}.{webhook-timestamp}.{raw body}` using the signing secret
(`REPLICATE_WEBHOOK_SECRET` - fetch once via
`GET https://api.replicate.com/v1/webhooks/default/secret`, see
`.env-example`), checked against every space-delimited signature in the
`webhook-signature` header with a constant-time comparison, plus a 5-minute
timestamp tolerance against replay. This is a different situation from
`sureplug-backend`'s own internal webhook (a shared-secret header, chosen
there specifically to avoid Express's raw-body-parsing complexity) - API
Gateway hands a Lambda the raw body directly with no global body-parser in
the way, so doing real signature verification here has no equivalent
friction, and Replicate is a third party we don't control the way we control
our own Lambda-to-Express hop.

## Classifying which images need background removal

There's no reliable pixel-level heuristic for "messy background that needs
cleanup" vs. "deliberately composed image that should be kept as-is" -
background variance, for instance, doesn't separate them (a marketing
graphic's gradient can have *low* variance; a real product photo's cluttered
background has *high* variance, same as a busy lifestyle shot). The strongest
cheap signal - detecting overlaid text - has a real false-positive mode for
us specifically: plenty of real products have text *on the product itself*
(packaging, labels, on-screen branding), so "text detected -> skip removal"
would wrongly skip genuine product photos constantly. This is a semantic
judgment call, which is exactly what a vision-capable model is good at and no
pixel heuristic is - so `ClassifyImage` asks one (`image-classification.ts`),
reusing Replicate rather than adding a new vendor: same API token, same
`createPrediction`/webhook infrastructure as `RemoveBackground`, just a
different model version (`IMAGE_CLASSIFIER_MODEL_VERSION`) and a text prompt
instead of a segmentation task.

`resolveImageClassification` is deliberately biased toward **KEEP** (skip
background removal) whenever the answer is anything other than an
unambiguous "CLEAN": an unparseable response, a response mentioning both
words, or even the Replicate prediction itself failing all resolve to KEEP,
never to an error that halts the pipeline. That's a deliberate asymmetry -
running background removal on a marketing graphic actively destroys it
(visible, bad); skipping removal on a real product photo just leaves that one
image less polished than it could've been (invisible, much less bad). When
unsure, prefer the mistake nobody notices.

`classify-image/handler.ts` and `remove-background/handler.ts` now share two
extracted helpers doing the identical boilerplate each needs:
`webhook-task-url.ts` (build a callback URL with N query-string params
embedded - generalized beyond `RemoveBackground`'s original 3, since
`ClassifyImage`'s callback also needs to pass `bucket`/`rawKey` through to
whichever stage runs next) and `replicate-webhook-request.ts` (verify the
inbound signature, extract the task token, hand back every query param plus
the parsed body) - both callback handlers now just destructure what they
specifically need and validate its presence themselves.

## Why the master stays transparent

A flat neutral background isn't enough on its own - a light product (white
sneakers, say) can lose almost all edge definition against a plain white or
near-white backdrop, because there's no lighting/shadow information in a
background-removal cutout the way there is in an actual studio photo (that's
how Amazon-style listings avoid this: professional lighting bakes in a
natural shadow before the photo is ever touched; a synthetic background
swap doesn't get that for free). Two things fix this, both in
`compose-on-neutral-background.ts`:

- **A synthesized contact shadow** - a soft, blurred dark ellipse anchored at
  the bottom of the subject's bounding box (`contact-shadow.ts` computes the
  geometry; the actual render is an SVG ellipse + Gaussian blur, composited
  under the product layer), which grounds the product and gives it a visible
  edge independent of the product's own color.
- **A slightly off-white neutral** (`NEUTRAL_BACKGROUND_COLOR`, default
  `#FAFAFA` rather than pure `#FFFFFF`) - enough separation that a paper-white
  product doesn't fully disappear at the pixel level, while still reading as
  "white" to the eye. The design system's `Paper` token
  (`oklch(.988 .004 95)`) was floated as a candidate for closer visual
  consistency with the rest of the storefront UI, but converting that to sRGB
  by hand risked shipping a wrong-but-plausible-looking color as fact, so this
  defaults to a plain, verifiable off-white instead - switching is a one-line
  env var change once the real value is confirmed.

Given that, **`CropSubject` deliberately does not composite onto a
background at all** - it writes the transparent, cropped cutout to
`cutout.png`. Compositing (background + shadow, via
`composeOntoNeutralBackground`) happens in `RenderVariants` instead, which
produces the opaque served `original.webp` and the sizes from it. Keeping
`cutout.png` around means a future backdrop change (a confirmed `Paper`
value, theme-aware backgrounds, a different shadow style) only needs
`RenderVariants` re-run against the cutout already in S3 - never the
expensive background-removal stage again.

## Setup

```
npm install
cp .env-example .env   # fill in the real values
npm run typecheck
npm test
```

### `sharp` on Lambda

`sharp` ships native binaries per platform/architecture. Building on a
different OS/arch than Lambda's (`linux`/`arm64` here) needs an explicit
cross-install step - `serverless.yml`'s `esbuild.packagerOptions.scripts` runs
`npm rebuild sharp --platform=linux --arch=arm64` as part of packaging so the
right binary ends up in the deployment artifact regardless of what you're
developing on.

## Commands

- `npm run typecheck` - `tsc --noEmit`.
- `npm test` / `npm run tdd` - unit tests (Vitest). Pure logic (blur score,
  mask bounds, crop/variant planning, classification parsing) is tested
  directly; most handlers are thin wrappers left to typecheck + bundle checks,
  except `render-variants` which runs a real `sharp` pipeline end-to-end
  (S3 mocked, actual image bytes) since it's the stage that produces every
  served asset.
- `npm run package` - `serverless package`, builds the deployment artifact
  without deploying anything.
- `npm run deploy` / `npm run deploy:dev` - deploys the stack. Needs AWS
  credentials and a configured Serverless Framework account/license
  (`serverless login`) - nobody should run this without knowing that's what
  it does.
- `npm run remove` - tears the stack down.

## State machine

Defined in `serverless.yml` via the `serverless-step-functions` plugin
(`stepFunctions.stateMachines.mediaPipeline`), not a separate ASL file - keeps
the state machine and the Lambda definitions it references in one place.
Currently `ClassifyImage` -> a Choice going straight to
`RenderVariantsPassthrough` (classifier said KEEP) or on to `BlurCheck` ->
`RemoveBackground` -> `CropSubject` -> a Choice going to `ReportNeedsReupload`
or `RenderVariantsComposite`. A too-blurry image routes to `ReportTooBlurry`.
Both render paths converge on `ReportReady`. All three `Report*` states are
the `reportResult` Lambda (retry/backoff on `States.ALL`) and then flow into
the single `PipelineComplete` success state. The only stage still missing is
the conditional `Upscale`.
