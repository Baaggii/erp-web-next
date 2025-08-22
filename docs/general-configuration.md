# General Configuration

`config/generalConfig.json` groups settings under `forms`, `pos`, `general` and an
`images` section.

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
    "aiApiEnabled": false,
    "requestPollingEnabled": false,
    "requestPollingIntervalSeconds": 30
  },
  "images": {
    "basePath": "uploads"
  }
}
```

The **Forms** section controls default sizing for all non‑POS transaction windows.
`boxWidth` sets the initial grid box width for these forms. Cells expand
up to `boxMaxWidth`/`boxMaxHeight` as text is entered and wrap when necessary.

The **POS** section provides the same options specifically for POS transactions.
Here `boxWidth` defines the initial grid box width of a POS transaction.

The **General** section hosts feature toggles. `requestPollingEnabled` controls
whether the client falls back to periodic API polling when a Socket.IO
connection cannot be established. `requestPollingIntervalSeconds` sets the
polling cadence (default 30&nbsp;seconds).

The **Images** tab exposes `basePath`, `cleanupDays` and an `ignoreOnSearch` list.
`basePath` sets the root directory for uploaded transaction images. The default
value `"uploads"` creates files under `<repo>/uploads/<table>/`.

`cleanupDays` defines the age threshold used when manually triggering the
`/api/transaction_images/cleanup` endpoint.

`ignoreOnSearch` lets administrators specify folder names to skip when searching
for images via the context-menu search feature.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.
