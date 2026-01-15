# CNC Processing API

The ERP backend exposes a developer-only CNC conversion endpoint for turning
raster or vector uploads into CNC-ready output.

## POST `/api/cnc_processing`

**Auth:** Requires a signed-in user with the **developer** permission.

### Request

- **Content-Type:** `multipart/form-data`
- **file** (required): PNG/JPG/SVG/DXF upload.
- **conversionType** (optional): Descriptive label such as `raster-to-vector`,
  `vector-to-gcode`, or `auto`.
- **outputFormat** (optional): `gcode` (default) or `dxf`.

### Response

```json
{
  "fileName": "part-2024-uuid.gcode",
  "downloadUrl": "https://erp.example.com/api/cnc_processing/download/part-2024-uuid.gcode",
  "outputFormat": "gcode",
  "inputType": "raster",
  "conversionType": "raster-to-vector",
  "processingTimeMs": 842,
  "sizeBytes": 12345
}
```

### Errors

- `400` – Missing upload or invalid parameters.
- `403` – User does not have developer access.
- `413` – File size exceeds 25&nbsp;MB.
- `415` – Unsupported file types.
- `500` – Conversion failures or missing conversion libraries.

## GET `/api/cnc_processing/download/:filename`

Downloads the CNC output produced by the POST endpoint. The download URL
returned in the POST response points to this route and is also protected by the
**developer** permission.
