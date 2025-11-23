function parseScalarValue(text) {
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  const asNumber = Number(text);
  if (!Number.isNaN(asNumber) && text.trim() !== '') {
    return asNumber;
  }
  if (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  ) {
    try {
      return JSON.parse(text);
    } catch {
      // ignore
    }
  }
  return text;
}

function parseLooseYaml(text) {
  const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
  const filtered = lines
    .map((line) => line.replace(/#.*$/, ''))
    .map((line) => ({ indent: line.match(/^ */)[0].length, content: line.trim() }))
    .filter((line) => line.content);

  function walk(startIndex, expectedIndent) {
    let index = startIndex;
    let result = null;
    while (index < filtered.length) {
      const { indent, content } = filtered[index];
      if (indent < expectedIndent) break;
      if (indent > expectedIndent) {
        index += 1;
        continue;
      }

      if (content.startsWith('- ')) {
        if (!Array.isArray(result)) result = [];
        const valuePart = content.slice(2).trim();
        if (!valuePart) {
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result.push(child);
          index = nextIndex;
          continue;
        }
        if (valuePart.includes(':') && !valuePart.startsWith('{') && !valuePart.startsWith('[')) {
          const [keyPart, rest] = valuePart.split(/:(.*)/);
          const base = {};
          if (rest && rest.trim()) {
            base[keyPart.trim()] = parseScalarValue(rest.trim());
          }
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result.push({ ...base, ...(child && typeof child === 'object' ? child : {}) });
          index = nextIndex;
          continue;
        }
        result.push(parseScalarValue(valuePart));
        index += 1;
        continue;
      }

      if (content.includes(':')) {
        if (!result || Array.isArray(result)) {
          if (result === null) result = {};
        }
        const [keyPart, rest] = content.split(/:(.*)/);
        const key = keyPart.trim();
        const remaining = (rest || '').trim();
        if (!remaining) {
          const [child, nextIndex] = walk(index + 1, expectedIndent + 2);
          result[key] = child;
          index = nextIndex;
          continue;
        }
        result[key] = parseScalarValue(remaining);
        index += 1;
        continue;
      }

      index += 1;
    }
    return [result, index];
  }

  const [parsed] = walk(0, filtered[0]?.indent ?? 0);
  return parsed;
}

let externalYaml = null;
try {
  const module = await import('js-yaml');
  externalYaml = module?.default || module;
} catch {
  // optional dependency
}

export function parseYaml(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Specification file is empty');
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  try {
    if (externalYaml?.load) {
      return externalYaml.load(trimmed);
    }
  } catch {
    // ignore missing optional dependency
  }
  const parsed = parseLooseYaml(trimmed);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unable to parse the supplied specification file');
  }
  return parsed;
}

export { parseLooseYaml };
