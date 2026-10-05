import { awsSesClient } from "../clients";
import { CreateOrUpdateTemplate } from "./create-or-update-template";
import { SendTestEmail } from "./send-test-email";

export const createOrUpdateTemplate = new CreateOrUpdateTemplate(awsSesClient);
export const sendTestEmail = new SendTestEmail(awsSesClient);
