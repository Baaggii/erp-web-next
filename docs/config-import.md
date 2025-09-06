# Configuration Import Structure

Default configuration templates live in the repository under `config/0/`.
Each tenant receives its own copy of these files under `config/<companyId>/`.

The `/api/config/import` endpoint copies a set of files from `config/0/`
into the tenant directory. Pass a JSON body with a `files` array listing the
filenames to copy and optionally a `companyId` query parameter.

```bash
POST /api/config/import?companyId=1
{ "files": ["generalConfig.json"] }
```

When the route is called without a `type` segment (i.e. `type=''`), files are
resolved relative to the root of the configuration folder (`config/0/`).
Subdirectories may still be used by providing a `type` segment in the URL, in
which case files are resolved under `config/0/<type>/`.

Add new configuration files to `config/0/` (or a subdirectory) following this
layout so they can be imported consistently for new tenants.

