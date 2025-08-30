# Translation Workflow

All UI strings are stored per language under `src/erp.mgt.mn/locales/<lang>.json`.
These locale files are generated automatically and should **not** be edited or
committed manually.

To add or update translations:

1. Reference a key in code using `t('my.key', 'Fallback text')`.
2. Run the translation generator which fetches the latest phrases and fills in
   missing languages:

```bash
npm run generate:translations
```

The script retrieves translations from the service and falls back to machine
translation when necessary. New locale files will be written under the
`locales` directory.

Because the files are generated, avoid committing changes to them. CI or
release builds will regenerate the locales as needed.
