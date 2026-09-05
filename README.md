# sureplug-serverless

The product-image processing pipeline for SurePlug: background removal,
compositing onto a neutral background, cropping, conditional upscaling, and
rendering the size variants the storefront actually serves. Runs as an AWS
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

1. **BlurCheck** *(the only stage implemented so far)* - rejects
   too-blurry uploads before paying for the far more expensive background-
   removal stage.
2. **RemoveBackground** *(not yet implemented)* - a lean OSS segmentation
   model via a serverless-GPU host (Replicate-class), submitted with a
   webhook so the state machine doesn't poll.
3. **CompositeAndCrop** *(not yet implemented)* - onto a neutral background,
   cropped from the segmentation mask's bounding box.
4. **Upscale** *(conditional, not yet implemented)* - only when the
   composited image's long edge is below a quality threshold.
5. **RenderVariants** *(not yet implemented)* - the fixed size set
   (`zoom`/`card`/`thumb`, WebP + JPEG) the storefront actually serves,
   written next to the original under the same `{fileId}/` folder.
6. **ReportResult** *(not yet implemented)* - calls
   `sureplug-backend`'s `POST /media/internal/pipeline-result` with the
   outcome (`READY` + the rendered variants, or `NEEDS_REUPLOAD` + a reason),
   authenticated with a shared secret header.

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
- `npm test` / `npm run tdd` - unit tests (Vitest). Pure logic (e.g. the blur
  score calculation) is unit-tested directly, with no AWS involved - handlers
  are thin wrappers around it.
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
Currently just `BlurCheck` - each stage above gets added as its own Lambda +
state as it's implemented.
