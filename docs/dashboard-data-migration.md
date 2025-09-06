# Dashboard Data Migration

Dashboard data is no longer loaded from `api-server/data/dashboard.js`. Each
tenant now reads from a JSON file resolved via `resolveDataPath('dashboard.json', companyId)`.

For every company, create:

```
api-server/data/<companyId>/dashboard.json
```

The file should map employee IDs to their dashboard entries:

```json
{
  "E1": {
    "tasks": [],
    "projects": [],
    "notifications": []
  }
}
```

Move existing data into the appropriate `dashboard.json` and remove the old
`api-server/data/dashboard.js` file.

