export default function parseConfigFromSql(sql) {
  const match = sql.match(/\/\*\s*RB_CONFIG([\s\S]*?)RB_CONFIG\s*\*\//i);
  if (!match) {
    return { config: null, error: 'No embedded config found' };
  }
  try {
    return { config: JSON.parse(match[1]), error: null };
  } catch {
    return { config: null, error: 'Invalid RB_CONFIG JSON' };
  }
}
