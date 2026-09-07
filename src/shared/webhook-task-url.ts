export function buildTaskWebhookUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string>
): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
