export default function parseProcedureConfig(sql = '') {
  const match = sql.match(/\/\*REPORT_BUILDER_CONFIG\s*([\s\S]*?)\*\//i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error('Invalid REPORT_BUILDER_CONFIG JSON');
  }
}
