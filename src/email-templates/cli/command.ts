import prompts from "prompts";
import { TEMPLATE_NAME_TO_FILE_MAPPER } from "../settings";
import { createOrUpdateTemplate, sendTestEmail } from "../usecases";

async function promptForAction() {
  return prompts([
    {
      type: "select",
      name: "action",
      message: "What action would you like to perform?",
      choices: [
        {
          title: "Create or update template",
          value: "create_or_update_template",
        },
        { title: "Send test email", value: "send_test_email" },
        { title: "Exit", value: "exit" },
      ],
    },
    {
      type: (prev) => (prev !== "exit" ? "select" : null),
      name: "templateName",
      message: "Choose the template",
      choices: Object.keys(TEMPLATE_NAME_TO_FILE_MAPPER).map((name) => ({
        title: name,
        value: name,
      })),
    },
  ]);
}

async function run(): Promise<void> {
  if (Object.keys(TEMPLATE_NAME_TO_FILE_MAPPER).length === 0) {
    console.log(
      "No templates registered yet - add one under src/email-templates/templates/ " +
        "and register it in src/email-templates/settings.ts first (see README.md)."
    );
    return;
  }

  let action = "";
  while (action !== "exit") {
    const answers = await promptForAction();
    action = answers.action;

    if (action === "create_or_update_template") {
      await createOrUpdateTemplate.execute(answers.templateName);
    }

    if (action === "send_test_email") {
      const { recipients } = await prompts({
        type: "text",
        name: "recipients",
        message: "Recipient email(s), comma-separated",
      });

      await sendTestEmail.execute(
        answers.templateName,
        (recipients as string).split(",").map((email) => email.trim())
      );
    }
  }
}

run();
