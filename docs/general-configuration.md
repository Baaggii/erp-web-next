# General Configuration

`config/generalConfig.json` holds global UI settings used by dynamic forms.

```json
{
  "labelFontSize": 14,
  "boxWidth": 60,
  "boxHeight": 30,
  "boxMaxWidth": 150
}
```

These values control label text size and input box dimensions across all forms.
Transaction grids start with `boxWidth` for each cell but stretch up to
`boxMaxWidth` when the content is longer. Changing `labelFontSize` automatically
adjusts the label text and the grid's input font size.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.
