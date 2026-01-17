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
  },
  "print": {
    "receiptFontSize": 12,
    "receiptWidth": 80,
    "receiptHeight": 200,
    "receiptMargin": 5,
    "receiptGap": 4
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
`workplaceFetchToastEnabled` (enabled by default) to surface diagnostic toasts
whenever the Reports page fetches workplace assignments, including the
parameters used, the SQL query executed, and the result counts.

The **Images** tab exposes `basePath`, `cleanupDays` and an `ignoreOnSearch` list.
`basePath` sets the root directory for uploaded transaction images. The default
value `"uploads"` creates files under `<repo>/uploads/<table>/`.

`cleanupDays` defines the age threshold used when manually triggering the
`/api/transaction_images/cleanup` endpoint.

`ignoreOnSearch` lets administrators specify folder names to skip when searching
for images via the context-menu search feature.

The **Print** section controls receipt output sizing for printed documents.
`receiptFontSize` sets the base font size (px), while `receiptWidth`,
`receiptHeight`, `receiptMargin`, and `receiptGap` (all in mm) are applied to the
print page size, margins, and spacing between printed copies.

The settings can be edited in the **General Configuration** screen
(module key `general_configuration`) under the Settings menu.

## CNC Processing API

The CNC conversion endpoint lives at `POST /api/cnc_processing` and accepts
multipart form data with a `file` upload (PNG, JPG, SVG, DXF). Optional
parameters such as `outputFormat` (`gcode` or `dxf`), `conversionType`,
`step`, `feedRate`, `cutDepth`, `safeHeight`, and `plungeRate` let developers
tune vectorization and toolpath generation. The response includes the output
`fileName`, `downloadUrl`, and `processingTimeMs`. Use
`GET /api/cnc_processing/download/:id` to download the generated file.
Requests are rate limited (20 requests per 15 minutes per user) and require the
developer permission key `cnc_processing`.

### CNC Processing usage

1. Open **CNC Converter** from the ERP navigation.
2. Upload an image (PNG/JPG) or an STL file.
3. Choose the processing type and output format.
4. Start the conversion and download the generated file when ready.

**Example request**

```bash
curl -X POST http://localhost:3000/api/cnc_processing \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@sample.png" \\
  -F "conversionType=2d_outline" \\
  -F "outputFormat=gcode"
```

**Example response**

```json
{
  "fileName": "sample.gcode",
  "downloadUrl": "http://localhost:3000/api/cnc_processing/download/abc123",
  "processingTimeMs": 812,
  "outputFormat": "gcode",
  "conversionType": "vectorize"
}
```

**Example output (G-code)**

```gcode
G21
G90
G1 X0 Y0 F800
G1 X10 Y0
M2
```
