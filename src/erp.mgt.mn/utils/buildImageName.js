export default function buildImageName(row = {}, fields = [], columnCaseMap = {}) {
  const missing = [];
  function getVal(obj, field) {
    if (!obj) return undefined;
    if (obj[field] !== undefined) return obj[field];
    const lower = field.toLowerCase();
    if (obj[columnCaseMap[lower]] !== undefined) return obj[columnCaseMap[lower]];
    const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
    return key ? obj[key] : undefined;
  }
  const sanitize = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '_');

  const parts = fields
    .map((f) => {
      let val = getVal(row, f);
      if (val && typeof val === 'object') val = val.value ?? val.label;
      if (!val) missing.push(f);
      return val;
    })
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => sanitize(v));

  const unique = Array.from(new Set(parts));
  let safe = unique.join('_');
  if (!safe) {
    const fallback =
      row._imageName ||
      row.ImageName ||
      row.image_name ||
      row[columnCaseMap['imagename']];
    safe = sanitize(fallback || '');
  }
  return { name: safe, missing };
}
