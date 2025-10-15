# Table Relations Performance & UX Review

## Summary of Findings
- Loading tables with many relational dropdowns triggered dozens of sequential API calls. Each relation fetched display metadata, tenant metadata, and **entire reference tables** one-by-one, re-downloading the same datasets when multiple columns pointed to the same table. This produced long blocking delays before the grid or edit modals became interactive.
- Search dropdowns rely on pre-loaded option arrays when synchronous relations exist. When relations were slow to hydrate, dependent forms displayed empty selects or stale values.
- The modal configuration UI (`TableRelationsEditor`) already supports async lookups, but the runtime table manager duplicated similar logic without leveraging shared caches.

## Why It Was Slow
1. **Sequential fetch pipeline** – per relation: fetch display config → fetch tenant info → loop through paginated reference rows. With five relations, this meant at least 15 network round-trips performed in series.
2. **No caching between columns** – the same reference table could be reloaded for every related column, multiplying bandwidth and JSON parsing cost.
3. **Nested label lookups** – each display field that was itself a relation kicked off even more fetch loops, magnifying cost for deeply-related schemas.
4. **Lack of cancellation** – when the user switched tables quickly, the previous requests continued to resolve, fighting for React state updates.

## Changes Implemented
- Added **per-table caches** for display configuration, tenant metadata, and reference rows. Repeated relations now reuse the in-flight promise instead of re-fetching.
- Persisted caches across renders within TableManager so relation dropdowns and modals stop replaying the entire hydration pipeline when the component re-renders or filters change.
- Parallelized relation hydration with `Promise.allSettled`, so multiple relations load concurrently while isolating failures per column, and made nested display lookups load in parallel instead of sequential blocking calls.
- Reused the same cache helpers for nested label generation, eliminating duplicate reference downloads for derived lookups.
- Added contextual cache keys (table + tenant scope) and guarded toast notifications to avoid spamming duplicate error messages when requests fail.

These adjustments cut the number of network round-trips dramatically and ensure the UI can render once the fastest subset of relations is ready.

## ERP Best Practices & Comparison
| Best Practice | Industry Guidance | Current State | Gap |
| --- | --- | --- | --- |
| **Lazy-load heavy reference data** | Defer large master data fetches until the user opens a picker or searches; use pagination & typeahead. | Reference tables were fully loaded on initial table render. | ✅ Implemented caching & concurrency; further improvements should consider lazy-loading only when a field is focused. |
| **Reuse shared metadata** | Centralize table metadata caches to keep UI responsive and consistent. | Metadata fetched repeatedly in multiple components. | ⚠️ Partially addressed; TableManager now caches per session, but a shared context/service would extend reuse across screens. |
| **Graceful degradation & feedback** | Show loading indicators per relation and allow partial readiness. | Whole view waited for slowest relation before populating dropdowns. | ⚠️ Still possible to expose per-field skeletons or fallback text so users can start editing sooner. |
| **Search-first UX for large sets** | Prefer async typeahead with server-side filtering for >1k records. | AsyncSearchSelect exists but not enforced for all relations. | ❌ Consider switching default relation controls to async search when row counts exceed a threshold. |
| **Abort stale requests** | Cancel outdated fetches when context changes. | Fetches continued after unmount/change. | ⚠️ New caching reduces impact, but adding `AbortController` per load would eliminate wasted work. |

## Suggested Roadmap Improvements
1. **Adopt AsyncSearchSelect automatically** when relation tables exceed a configurable row limit, falling back to synchronous selects only for small enumerations.
2. **Share relation caches app-wide** (e.g., via React context or SWR/React Query) so switching between tables reuses prior fetches and keeps state normalized.
3. **Introduce field-level loading indicators** in forms so editors can begin entering other fields while a heavy relation hydrates.
4. **Add AbortController support** within the relation loader to cancel in-flight fetches when the selected table or tenant scope changes.
5. **Server-side optimizations** (outside this patch): provide dedicated endpoints that return minimal label/value pairs for relations to reduce payload size and parse overhead.

## Testing
Manual regression focused on:
- Switching tables with different relation sets to confirm dropdowns populate and toasts behave sensibly.
- Verifying cached relations respond instantly when toggling between edit/view modals for the same table.

Automated tests remain unchanged; run the existing suite to validate broader functionality.
