# POS Transaction Layout Settings

Forms used by POS transactions support a special **fitted** view. In this mode all padding and borders are removed so the contents fill the parent window. Input sizing is now controlled globally from `config/generalConfig.json` instead of the transaction configuration. The file can specify:

```json
{
  "labelFontSize": 14,
  "boxWidth": 60,
  "boxHeight": 30,
  "boxMaxWidth": 150
}
```

`labelFontSize` sets the label text size while `boxWidth` and `boxHeight` set the minimum width and height. `boxMaxWidth` caps the maximum width before wrapping.



