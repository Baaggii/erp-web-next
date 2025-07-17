# POS Transaction Layout Settings

Forms used by POS transactions support a special **fitted** view. In this mode all padding and borders are removed so the contents fill the parent window. The layout can be tuned globally per transaction configuration by adding the following optional properties to each entry inside `config/posTransactionConfig.json`:

```json
{
  "labelFontSize": 14,
  "boxWidth": 60,
  "boxHeight": 30
}
```

`labelFontSize` sets the label text size while `boxWidth` and `boxHeight` limit the input width and height. When omitted, the defaults are `14`, `60` and `30` respectively. Inputs may expand up to 150px before wrapping. Only fitted forms apply these settings.

Example configuration snippet:

```json
{
  "sales": {
    "labelFontSize": 16,
    "boxWidth": 200,
    "boxHeight": 32,
    "tables": []
  }
}
```

