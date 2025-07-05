export default function splitSql(sqlText) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escape = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      current += ch;
      statements.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}
