export function slugify(text) {
  const basic = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  if (basic) return basic;
  // Fallback for non-Latin text: hex encode to ensure ASCII slug
  return (
    't_' + Buffer.from(String(text)).toString('hex').slice(0, 32)
  );
}
