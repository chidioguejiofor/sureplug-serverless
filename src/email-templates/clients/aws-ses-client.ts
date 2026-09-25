import {
  CreateTemplateCommand,
  GetTemplateCommand,
  SESClient,
  SendTemplatedEmailCommand,
  UpdateTemplateCommand,
} from "@aws-sdk/client-ses";
import { AWS_REGION } from "../../shared/settings";
import { SES_SOURCE_EMAIL } from "../settings";
import {
  IEmailSenderClient,
  SendEmailInput,
  TemplateContent,
} from "../interfaces";
import { CreateTemplateFailed, UpdateTemplateFailed } from "../errors";

const ses = new SESClient({ region: AWS_REGION });

class AwsSesClient implements IEmailSenderClient {
  async send(input: SendEmailInput): Promise<void> {
    try {
      const command = new SendTemplatedEmailCommand({
        Source: SES_SOURCE_EMAIL,
        Template: input.templateName,
        Destination: { ToAddresses: input.toAddresses },
        TemplateData: JSON.stringify(input.templateData),
      });
      await ses.send(command);
      console.log(`Sent test email using template "${input.templateName}"`);
    } catch (error) {
      console.error(
        `Failed to send test email using template "${input.templateName}"`,
        error
      );
    }
  }

  async templateExists(templateName: string): Promise<boolean> {
    try {
      await ses.send(new GetTemplateCommand({ TemplateName: templateName }));
      return true;
    } catch {
      return false;
    }
  }

  async createTemplate(
    templateName: string,
    { html, text }: TemplateContent
  ): Promise<void> {
    try {
      await ses.send(
        new CreateTemplateCommand({
          Template: {
            TemplateName: templateName,
            HtmlPart: html,
            TextPart: text,
            SubjectPart: "{{subject}}",
          },
        })
      );
    } catch (error) {
      console.error(`Failed to create SES template "${templateName}"`, error);
      throw new CreateTemplateFailed(templateName);
    }
  }

  async updateTemplate(
    templateName: string,
    { html, text }: TemplateContent
  ): Promise<void> {
    try {
      await ses.send(
        new UpdateTemplateCommand({
          Template: {
            TemplateName: templateName,
            HtmlPart: html,
            TextPart: text,
            SubjectPart: "{{subject}}",
          },
        })
      );
    } catch (error) {
      console.error(`Failed to update SES template "${templateName}"`, error);
      throw new UpdateTemplateFailed(templateName);
    }
  }
}

export const awsSesClient = new AwsSesClient();
