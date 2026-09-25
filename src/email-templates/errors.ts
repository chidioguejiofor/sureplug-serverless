export class InvalidTemplateName extends Error {
  constructor(templateName: string) {
    super(`"${templateName}" is not a registered template name.`);
  }
}

export class CreateTemplateFailed extends Error {
  constructor(templateName: string) {
    super(`Failed to create SES template "${templateName}".`);
  }
}

export class UpdateTemplateFailed extends Error {
  constructor(templateName: string) {
    super(`Failed to update SES template "${templateName}".`);
  }
}
