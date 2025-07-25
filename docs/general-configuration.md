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
Transaction grids now default to `boxMaxWidth` for both labels and inputs so cells
expand up to that width. Changing `labelFontSize` automatically adjusts the text
size in the grids as well.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.
