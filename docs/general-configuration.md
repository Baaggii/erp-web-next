# General Configuration

`config/generalConfig.json` now groups settings under `forms` and `pos`.

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
  }
}
```

The **Forms** section controls default sizing for all non‑POS transaction windows.
`boxWidth` sets the initial grid box width for these forms. Cells expand
up to `boxMaxWidth`/`boxMaxHeight` as text is entered and wrap when necessary.

The **POS** section provides the same options specifically for POS transactions.
Here `boxWidth` defines the initial grid box width of a POS transaction.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.

## Image Storage

The optional `imageStorage` section configures where uploaded images are saved.

```json
{
  "imageStorage": {
    "basePath": "uploaded_images/",
    "defaultFolder": "transactions/",
    "posFolder": "transactions_pos/"
  }
}
```

`basePath` determines the root folder under the project directory for all
transaction images. `defaultFolder` and `posFolder` define subfolders used when
building image paths for regular and POS transactions respectively.
