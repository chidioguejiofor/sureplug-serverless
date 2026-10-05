# Email templates

Authoring and publishing for SurePlug's transactional email templates, hosted
in AWS SES's classic template store (`CreateTemplate`/`UpdateTemplate`/
`SendTemplatedEmail` - not SESv2's newer template API, since the SurePlug
backend's `notification` domain sends against this same store).

This is a local/CI admin tool, not a deployed Lambda - nothing here is wired
into `serverless.yml`.

## Adding a template

1. Add a folder under `templates/<template-name>/` with:
   - `main.html` - the HTML body. Can reference shared partials with
     `{{ html_part_<partial-key> }}` (see `templates/_partials/`).
   - `main.txt` - the plaintext fallback.
   - `emailData.json` - sample data used by the CLI's "send test email"
     action.
   - `assets/` - optional. Any images the template references - see "Images"
     below.
2. Register it in `settings.ts`'s `TEMPLATE_NAME_TO_FILE_MAPPER`, e.g.:
   ```ts
   export const TEMPLATE_NAME_TO_FILE_MAPPER = {
     RegistrationWelcome: "registration-welcome",
   };
   ```
   The key is the literal SES template name - it must match, character for
   character, whatever string sureplug-backend's notification service uses
   when it calls `SendTemplatedEmailCommand`. There's no shared package
   enforcing this; keep the two repos in sync by hand.
3. Run `npm run templates`, choose "Create or update template", then the
   template name, to push it to SES.
4. Optionally choose "Send test email" to confirm it renders correctly
   against `emailData.json` before wiring the backend call.

## Images

Images are hosted on CloudFront and referenced by absolute HTTPS URL - email
clients can't resolve relative paths, and SES won't host assets for you. A
template's images live in its own `templates/<template-name>/assets/` folder
and are served at
`https://dkd8gmstqydrg.cloudfront.net/email/<template-name>/<file>`
- one folder per template, mirroring the CloudFront path exactly, so the
whole folder uploads together and there's never a question of which images
belong to which template. `templates/customer-welcome/assets/hero.png` is the
reference: it's served at `.../email/customer-welcome/hero.png`.

Each image's source is an SVG next to the PNG actually uploaded - the SVG is
what you edit; the PNG is a build artifact regenerated from it with `sharp`,
already a dependency of this repo:

```bash
node -e "require('sharp')('src/email-templates/templates/customer-welcome/assets/hero.svg') \
  .resize(640,440).png({compressionLevel:9}) \
  .toFile('src/email-templates/templates/customer-welcome/assets/hero.png')"
```

Then sync the whole folder to the bucket behind that CloudFront distribution,
preserving the `<template-name>/<file>` structure:

```bash
aws s3 sync src/email-templates/templates/customer-welcome/assets/ \
  s3://<your-bucket>/email/customer-welcome/ \
  --exclude "*.svg" \
  --content-type image/png \
  --cache-control "public, max-age=31536000, immutable"
```

Nothing in this repo deploys assets - that sync is a manual step, and the
template will show broken images until it happens. Note the long cache
lifetime: replacing a PNG at the same path needs a CloudFront invalidation,
or viewers keep seeing the old file for up to a year.

Rules for any image added to a template:

- **Export at 2x, display at 1x.** The welcome hero is a 640x440 PNG shown at
  `width="320"`, so it stays sharp on retina displays.
- **Transparent or white background.** The card behind it is `#ffffff`; a
  coloured backdrop renders as a visible rectangle sitting on the card.
- **Always set the `width` attribute**, not just a CSS width - Outlook ignores
  the stylesheet and will render the image at its intrinsic size without it.
  Pair it with `max-width:100%;height:auto` so it still shrinks on a phone.
- **Write alt text that carries meaning.** Gmail blocks images by default, so
  the alt string is what a large share of recipients read first.
- **Keep every template readable with images off.** An image may add warmth; it
  may never be the only thing carrying a message.
- **Budget ~100KB per image.** These are opened on Nigerian mobile data, and a
  heavy decorative asset is a cost the recipient pays.
- **Check the licence before uploading.** Flaticon's free tier requires
  attribution in the footer of every email it ships in; LottieFiles licences
  vary per asset. Animation itself is not an option here - no email client runs
  JavaScript, so Lottie never renders; an animated GIF is the only moving
  format, and classic Outlook for Windows shows only its first frame.

## Environment

- `AWS_REGION` - reused from the rest of this repo.
- `SES_SOURCE_EMAIL` - the verified "from" address used by "send test email".
  Only needed for that action; template create/update doesn't send mail.

AWS credentials come from the default AWS SDK provider chain (profile,
`AWS_PROFILE`, SSO, etc.) - the same as every other AWS client in this repo.
Real sends (and even test sends, until the account is out of the SES
sandbox) require the sender/recipient addresses to be verified in SES.
