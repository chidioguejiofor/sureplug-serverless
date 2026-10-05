import fs from "fs";
import path from "path";
import { IEmailSenderClient } from "../interfaces";
import { TEMPLATE_NAME_TO_FILE_MAPPER, TemplateNames } from "../settings";

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export class SendTestEmail {
  constructor(private emailClient: IEmailSenderClient) {}

  async execute(
    templateName: TemplateNames,
    recipients: string[]
  ): Promise<void> {
    const folderName = TEMPLATE_NAME_TO_FILE_MAPPER[templateName];
    const json = fs.readFileSync(
      path.join(TEMPLATES_DIR, folderName, "emailData.json"),
      "utf-8"
    );

    await this.emailClient.send({
      templateName,
      templateData: JSON.parse(json),
      toAddresses: recipients,
    });
  }
}
