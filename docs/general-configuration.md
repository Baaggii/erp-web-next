# General Configuration

`config/generalConfig.json` now groups settings under `forms`, `pos` and a new
`general` section.

```json
{
  "forms": {
    "labelFontSize": 14,
    "boxWidth": 60,
    "boxHeight": 30,
    "boxMaxWidth": 150,
    "boxMaxHeight": 150
  },
  "pos": {
    "labelFontSize": 14,
    "boxWidth": 60,
    "boxHeight": 30,
    "boxMaxWidth": 200,
    "boxMaxHeight": 150
  },
  "general": {
    "imageStorage": {
      "basePath": "uploads"
    }
  }
}
```

The **Forms** section controls default sizing for all non‑POS transaction windows.
`boxWidth` sets the initial grid box width for these forms. Cells expand
up to `boxMaxWidth`/`boxMaxHeight` as text is entered and wrap when necessary.

The **POS** section provides the same options specifically for POS transactions.
Here `boxWidth` defines the initial grid box width of a POS transaction.

The **General** tab now contains `imageStorage.basePath` which sets the root
directory for any uploaded transaction images. The default value `"uploads"`
creates files under `<repo>/uploads/<table>/`.

`imageStorage.cleanupDays` defines the age threshold used when manually
triggering the `/api/transaction_images/cleanup` endpoint. The application does
not run this cleanup automatically so administrators can control when old images
are removed.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.
