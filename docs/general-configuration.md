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
    "requestPollingIntervalSeconds": 30,
    "txnToastEnabled": false
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

The **General** section hosts feature toggles. `showTourButtons` controls
whether the tour action group is displayed in the ERP window header. Toggle it
off to hide the Create/Edit/View tour buttons across the application.
`tourBuilderEnabled` governs whether administrators with the `system_settings`
permission can launch the tour builder to create or edit guides. Other options
include `requestPollingEnabled`, which determines whether the client
falls back to periodic API polling when a Socket.IO connection cannot be
established, and `requestPollingIntervalSeconds`, which sets the polling
cadence (default 30&nbsp;seconds). Enable `txnToastEnabled` when you need the
app to surface debug toasts for transaction fetch/edit flows; it defaults to
`false` so the extra notifications stay hidden in production. Set
`workplaceFetchToastEnabled` to surface diagnostic toasts whenever the Reports
page fetches workplace assignments, including the parameters used, the SQL
query executed, and the result counts.

The **Images** tab exposes `basePath`, `cleanupDays` and an `ignoreOnSearch` list.
`basePath` sets the root directory for uploaded transaction images. The default
value `"uploads"` creates files under `<repo>/uploads/<table>/`.

`cleanupDays` defines the age threshold used when manually triggering the
`/api/transaction_images/cleanup` endpoint.

`ignoreOnSearch` lets administrators specify folder names to skip when searching
for images via the context-menu search feature.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.
