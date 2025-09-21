const CYRILLIC_CHAR_REGEX = /[\u0400-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u1C80-\u1C8F]/u;
const LATIN_CHAR_REGEX = /[A-Za-z\u00C0-\u024F]/u;

export default function detectLocaleFromText(text) {
  if (text === null || text === undefined) {
    return null;
  }

  const str = typeof text === 'string' ? text : String(text);
  let cyrillicCount = 0;
  let latinCount = 0;

  for (const char of str) {
    if (CYRILLIC_CHAR_REGEX.test(char)) {
      cyrillicCount += 1;
    } else if (LATIN_CHAR_REGEX.test(char)) {
      latinCount += 1;
    }
  }

  if (!cyrillicCount && !latinCount) {
    return null;
  }

  if (cyrillicCount && !latinCount) {
    return 'mn';
  }

  if (latinCount && !cyrillicCount) {
    return 'en';
  }

  return cyrillicCount > latinCount ? 'mn' : 'en';
}
