# Table Modal Relations Performance Review

## Overview
This document captures the results of reviewing the modal that edits table rows in the ERP web client, with a focus on relation-aware fields, dropdown population, and search behaviour. It explains why the modal flashes while loading and why relation-backed inputs feel slow, and it summarizes industry practices alongside concrete improvement opportunities.

## Current implementation

### Relation data loading in `TableManager`
* When the user opens a table, `TableManager` calls the `/relations` endpoint, constructs a relation map, then eagerly downloads every referenced table to populate dropdown options (`loadRelationColumn`). Each relation fetch walks through the entire result set in 500 row pages until the server reports completion, even if only a handful of options are needed for the current record.【F:src/erp.mgt.mn/components/TableManager.jsx†L1305-L1493】
* After the relation map is ready, the component issues three separate state updates (`setRefData`, `setRefRows`, `setRelationConfigs`). Because these updates happen before the modal opens, `RowFormModal` briefly renders without relation metadata and then re-renders once the configs arrive, producing the visible flash.【F:src/erp.mgt.mn/components/TableManager.jsx†L1560-L1603】【F:src/erp.mgt.mn/components/RowFormModal.jsx†L1813-L1960】
* The preloaded relation rows are also stored in `relationData` and passed to the modal to support preview popovers, but the modal performs a real-time fetch if the cache misses, so preloading every row is redundant for rarely-opened previews.【F:src/erp.mgt.mn/components/RowFormModal.jsx†L1389-L1412】

### Async search select behaviour
* `AsyncSearchSelect` immediately fires a network request whenever the dropdown opens or whenever the input text changes. There is no debouncing or memoization, so typing “abc” issues three back-to-back `/api/tables/...` calls. Each request rebuilds options from scratch and only caches the most recent page in local component state.【F:src/erp.mgt.mn/components/AsyncSearchSelect.jsx†L118-L217】
* The component recursively calls `fetchPage` if the current query returned an empty page but the server reports more results, which can lead to multiple serial round trips for a single lookup.【F:src/erp.mgt.mn/components/AsyncSearchSelect.jsx†L213-L217】

## ERP best practices and comparison
* **Lazy relation lookups.** Modern ERP suites avoid preloading entire reference tables for every modal. Instead they defer loading until the field is focused, often querying by the typed prefix or by the current foreign-key value. The current implementation always downloads the entire table, even when the user never opens the dropdown, which increases latency and bandwidth usage compared with the industry approach.【F:src/erp.mgt.mn/components/TableManager.jsx†L1305-L1493】
* **Stable UI while data loads.** UX guidelines recommend keeping the control type stable (e.g., show a disabled select or skeleton) until relation metadata is ready. Today the modal renders a plain text input first and swaps it for a select/search component later, causing a visible flash that breaks the user’s typing flow.【F:src/erp.mgt.mn/components/TableManager.jsx†L1560-L1603】【F:src/erp.mgt.mn/components/RowFormModal.jsx†L1813-L1960】
* **Throttled, cached search requests.** Enterprise dropdowns typically debounce keystrokes (150–300 ms) and reuse previous responses for identical queries to reduce backend load. Our `AsyncSearchSelect` fires an API request per keystroke without caching, leading to unnecessary traffic and slower perceived performance versus best practice.【F:src/erp.mgt.mn/components/AsyncSearchSelect.jsx†L118-L217】

## Suggested improvements
1. **Switch to just-in-time relation fetching.** Instead of preloading all relation rows, expose minimal configs (`table`, `column`, `idField`) as soon as the relation map is known and let `AsyncSearchSelect` fetch options on demand. This removes the expensive `fetchTableRows` loop and shortens modal open time.【F:src/erp.mgt.mn/components/TableManager.jsx†L1305-L1565】【F:src/erp.mgt.mn/components/RowFormModal.jsx†L1813-L1960】
2. **Batch state updates or gate rendering behind a loading flag.** Return a single object `{ relations, refData, refRows, configs }` from the loader or pass an explicit `relationsLoading` prop so the modal can render a consistent skeleton instead of switching control types mid-render.【F:src/erp.mgt.mn/components/TableManager.jsx†L1560-L1603】
3. **Debounce and cache async searches.** Wrap the input change handler in a debounce and keep a simple query → options cache keyed by `table` and normalized search text. This would collapse rapid keystrokes into one API call and reuse prior responses when the user reopens the dropdown.【F:src/erp.mgt.mn/components/AsyncSearchSelect.jsx†L118-L217】
4. **Limit recursive page walking.** Cap the number of chained `fetchPage` calls per query or request larger page sizes when searching to avoid multiple sequential requests for sparse results.【F:src/erp.mgt.mn/components/AsyncSearchSelect.jsx†L213-L217】
5. **Load preview rows on demand.** Keep the on-demand fetch fallback in the modal and remove eager caching of every relation row to further decrease initial load time while still supporting the preview dialog.【F:src/erp.mgt.mn/components/RowFormModal.jsx†L1389-L1412】

Implementing the above will reduce the number of renders during modal initialization, cut relation-loading latency, and align the user experience with typical ERP expectations.
