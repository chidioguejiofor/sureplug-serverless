export type SendEmailInput = {
  toAddresses: string[];
  templateName: string;
  templateData: Record<string, unknown>;
};

export type TemplateContent = {
  html: string;
  text: string;
};

export interface IEmailSenderClient {
  send: (input: SendEmailInput) => Promise<void>;
  templateExists: (templateName: string) => Promise<boolean>;
  createTemplate: (
    templateName: string,
    input: TemplateContent
  ) => Promise<void>;
  updateTemplate: (
    templateName: string,
    input: TemplateContent
  ) => Promise<void>;
}
