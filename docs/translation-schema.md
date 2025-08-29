# Translation Schema

Translations live in `src/erp.mgt.mn/context/translations.json` and use the following structure:

```json
{
  "translationKey": {
    "mn": "Mongolian text",
    "en": "English text",
    "ja": "Japanese text",
    "ko": "Korean text",
    "zh": "Chinese text",
    "es": "Spanish text",
    "de": "German text",
    "fr": "French text",
    "ru": "Russian text"
  }
}
```

An automated helper script can prefill missing languages using machine translation:

```bash
node scripts/prefillTranslations.js
```

The script attempts to translate from the existing English (or Mongolian) values and
falls back to the source text if an external translation service is unreachable.
