# Database Migrations

Migrations are plain SQL files executed in filename order. Use the `YYYY-MM-DD_description.sql` naming convention and append new files at the end.

A special global tenant exists in the `companies` table with `id=0` and name `Global Defaults`. Migration `2025-10-29_global_defaults_company.sql` seeds this row. Future migrations may assume it exists and should use `company_id=0` when inserting shared records.
