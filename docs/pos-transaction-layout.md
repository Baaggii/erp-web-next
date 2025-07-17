# POS Transaction Layout Settings

Forms used by POS transactions support a special **fitted** view. In this mode all padding and borders are removed so the contents fill the parent window. The layout can be tuned globally per transaction configuration by adding the following optional properties to each entry inside `config/posTransactionConfig.json`:

```json
{
  "labelSize": 100,
  "boxSize": 180
}
```

`labelSize` controls the pixel width of each label while `boxSize` defines the width of the input element. When omitted, the defaults are `100` and `180` respectively. Only fitted forms apply these settings.

Example configuration snippet:

```json
{
  "sales": {
    "labelSize": 120,
    "boxSize": 200,
    "tables": []
  }
}
```

