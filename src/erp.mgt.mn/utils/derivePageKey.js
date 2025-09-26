export default function derivePageKey(inputPath) {
  if (typeof inputPath !== 'string') {
    return 'home';
  }

  const normalized = inputPath.trim();
  if (!normalized) {
    return 'home';
  }

  const cleaned = normalized.replace(/^[#\/]+|[#\/]+$/g, '');
  if (!cleaned) {
    return 'home';
  }

  const segments = cleaned
    .split(/[\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .map((segment) => segment.replace(/-+/g, '-'))
    .map((segment) => segment.toLowerCase())
    .filter(Boolean);

  const joined = segments.join('-');
  return joined || 'home';
}
