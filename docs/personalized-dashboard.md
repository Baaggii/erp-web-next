# Personalized Dashboard Module

The user dashboard introduced in this repository is exposed via the module with key **`sales`**. In the Modules UI or when seeding `db/defaultModules.js` this entry uses the Mongolian label `Борлуулалтын самбар` ("Sales Dashboard").

To enable or locate the dashboard:

1. Open **Settings → Modules** within the app.
2. Look for the row where `module_key` is `sales`.
3. Make sure the module is licensed for the desired company and that the relevant role has permission to access it.

Once licensed and permitted, the dashboard is available at `/sales` and appears in the header menu under the "Sales Dashboard" name.
