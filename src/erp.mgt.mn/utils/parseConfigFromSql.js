export default function parseConfigFromSql(sql) {
  const match = sql.match(/\/\*\s*RB_CONFIG([\s\S]*?)RB_CONFIG\s*\*\//i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error('Invalid RB_CONFIG JSON');
  }
}
