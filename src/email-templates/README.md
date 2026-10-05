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

## Environment

- `AWS_REGION` - reused from the rest of this repo.
- `SES_SOURCE_EMAIL` - the verified "from" address used by "send test email".
  Only needed for that action; template create/update doesn't send mail.

AWS credentials come from the default AWS SDK provider chain (profile,
`AWS_PROFILE`, SSO, etc.) - the same as every other AWS client in this repo.
Real sends (and even test sends, until the account is out of the SES
sandbox) require the sender/recipient addresses to be verified in SES.
