export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[:\/\\?#\[\]@!$&'()*+,;=]/g, '-')
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unnamed';
}
