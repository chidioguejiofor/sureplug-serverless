import fs from "fs";
import path from "path";
import { combinedPartials } from "../templates/_partials";
import { InvalidTemplateName } from "../errors";
import { IEmailSenderClient } from "../interfaces";
import { TEMPLATE_NAME_TO_FILE_MAPPER, TemplateNames } from "../settings";

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export class CreateOrUpdateTemplate {
  constructor(private emailClient: IEmailSenderClient) {}

  async execute(templateName: TemplateNames): Promise<void> {
    if (!(templateName in TEMPLATE_NAME_TO_FILE_MAPPER)) {
      throw new InvalidTemplateName(templateName);
    }

    const folderName = TEMPLATE_NAME_TO_FILE_MAPPER[templateName];
    let html = fs.readFileSync(
      path.join(TEMPLATES_DIR, folderName, "main.html"),
      "utf-8"
    );

    for (const [key, htmlPart] of Object.entries(combinedPartials)) {
      const regex = new RegExp(`{{\\s*html_part_${key}\\s*}}`, "gm");
      html = html.replace(regex, htmlPart);
    }

    const text = fs.readFileSync(
      path.join(TEMPLATES_DIR, folderName, "main.txt"),
      "utf-8"
    );

    const exists = await this.emailClient.templateExists(templateName);
    if (exists) {
      await this.emailClient.updateTemplate(templateName, { html, text });
      console.log(`Updated SES template "${templateName}"`);
    } else {
      await this.emailClient.createTemplate(templateName, { html, text });
      console.log(`Created SES template "${templateName}"`);
    }
  }
}
