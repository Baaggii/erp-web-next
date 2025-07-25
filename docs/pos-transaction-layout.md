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

`labelFontSize` sets the text size used by both labels and values in the grid.
`boxWidth` gives the default width for cells while `boxMaxWidth` is the maximum
size a cell can stretch to when the content is wider. `boxHeight` controls input
height.



`labelFontSize` sets the text size used by both labels and values in the grid.
`boxWidth` gives the default width for cells while `boxMaxWidth` is the maximum
size a cell can stretch to when the content is wider. `boxHeight` controls input
height.