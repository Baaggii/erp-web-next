# POS Transaction Layout Settings

Forms used by POS transactions support a special **fitted** view. In this mode all padding and borders are removed so the contents fill the parent window. The layout now reads its sizing from the `pos` section of `config/generalConfig.json`:

```json
{
  "pos": {
    "labelFontSize": 14,
    "boxWidth": 60,
    "boxHeight": 30,
    "boxMaxWidth": 150,
    "boxMaxHeight": 150
  }
}
```

`labelFontSize` sets the text size used by both labels and values in the grid.
`boxWidth` gives the initial width for grid cells in the POS transaction window
while `boxMaxWidth` and `boxMaxHeight` limit how far a cell can stretch when the
content is larger.
