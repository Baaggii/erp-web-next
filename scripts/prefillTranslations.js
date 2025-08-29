import fs from 'fs';
const file = 'src/erp.mgt.mn/context/translations.json';
const languages = ['mn','en','ja','ko','zh','es','de','fr','ru'];

async function translate(text, to, from = 'en') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to translate to ${to}`);
    const data = await res.json();
    return data[0].map((t) => t[0]).join('');
  } catch (e) {
    console.warn(`Translation service unavailable for ${to}, using source text`);
    return text;
  }
}

async function main() {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(json)) {
    for (const lang of languages) {
      if (!json[key][lang]) {
        const baseLang = json[key].en ? 'en' : 'mn';
        const baseText = json[key][baseLang];
        json[key][lang] = await translate(baseText, lang, baseLang);
        console.log(`Translated ${key} -> ${lang}`);
      }
    }
    const ordered = {};
    for (const lang of languages) {
      if (json[key][lang]) ordered[lang] = json[key][lang];
    }
    json[key] = ordered;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
