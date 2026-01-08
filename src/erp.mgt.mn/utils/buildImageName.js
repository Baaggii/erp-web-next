export default function buildImageName(row = {}, fields = [], columnCaseMap = {}, companyId) {
  const missing = [];
  function unwrapValue(value) {
    if (value && typeof value === 'object') {
      if (value.value !== undefined && value.value !== null) return value.value;
      if (value.id !== undefined && value.id !== null) return value.id;
      if (value.Id !== undefined && value.Id !== null) return value.Id;
      if (value.label !== undefined && value.label !== null) return value.label;
    }
    return value;
  }
  function getVal(obj, field) {
    if (!obj) return undefined;
    if (obj[field] !== undefined) return unwrapValue(obj[field]);
    const lower = field.toLowerCase();
    if (obj[columnCaseMap[lower]] !== undefined) {
      return unwrapValue(obj[columnCaseMap[lower]]);
    }
    const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
    return key ? unwrapValue(obj[key]) : undefined;
  }
  const parts = fields
    .map((f) => {
      let val = getVal(row, f);
      if (!val) missing.push(f);
      return val;
    })
    .filter((v) => v !== undefined && v !== null && v !== '')
    .join('_');
  const sanitize = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '_');
  let safe = sanitize(parts);
  if (!safe) {
    const fallback =
      row._imageName ||
      row.ImageName ||
      row.image_name ||
      row[columnCaseMap['imagename']];
    safe = sanitize(fallback || '');
  }
  const url =
    companyId != null && safe ? `/api/uploads/${companyId}/${safe}` : undefined;
  return { name: safe, missing, url };
}
