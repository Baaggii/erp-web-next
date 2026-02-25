# Accounting Period Closing

## Database

`fin_period_control` tracks period state by company + fiscal year:

- `company_id`, `fiscal_year` composite key
- `period_from`, `period_to`
- `is_closed`, `closed_at`, `closed_by`

Migration: `db/migrations/2026-02-24_fin_period_control_constraints.sql` adds indexes and `companies(id)` foreign key.

## API

### `GET /api/period-control/status?company_id=...&fiscal_year=...`

Returns the period metadata (creating a default Jan 1–Dec 31 row if missing).

### `POST /api/period-control/close`

Payload:

```json
{
  "company_id": 1,
  "fiscal_year": 2025,
  "report_procedures": [
    "dynrep_1_sp_trial_balance_expandable",
    "dynrep_1_sp_income_statement_expandable",
    "dynrep_1_sp_balance_sheet_expandable"
  ]
}
```

Validation rules:

- `company_id` is required positive integer
- `fiscal_year` is required integer (1900–3000)
- `report_procedures` is required non-empty array of non-empty strings

Success response:

```json
{
  "ok": true,
  "nextFiscalYear": 2026,
  "openingJournalId": 12345
}
```

## Default procedure list

Frontend default is configured in:

- `src/erp.mgt.mn/pages/AccountingPeriods.jsx` (`DEFAULT_REPORT_PROCS`)

Override options:

1. User can edit the comma-separated procedure list in the UI before closing.
2. API callers can pass any validated procedure list via `report_procedures`.
