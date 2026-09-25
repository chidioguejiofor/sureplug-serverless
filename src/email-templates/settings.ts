export const SES_SOURCE_EMAIL = process.env.SES_SOURCE_EMAIL || "";

// The registry: SES template name -> local folder under templates/. Templates
// land here one at a time - see sureplug-backend's EPIC 20 (Notification domain).
export const TEMPLATE_NAME_TO_FILE_MAPPER: Record<string, string> = {};

export type TemplateNames = keyof typeof TEMPLATE_NAME_TO_FILE_MAPPER;
