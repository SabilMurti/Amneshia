export function toSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/\.+/g, '-')
    .replace(/[:\/\\?#\[\]@!$&'()*+,;=]/g, '-')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || slug === '.' || slug === '..') {
    return 'unnamed';
  }
  return slug;
}
