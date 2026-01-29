import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
  useLayoutEffect,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { getTenantKeyList } from '../utils/tenantKeys.js';
import { buildOptionsForRows } from '../utils/buildAsyncSelectOptions.js';
import { extractRowIndex, sortRowsByIndex } from '../utils/sortRowsByIndex.js';
import safeRequest from '../utils/safeRequest.js';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const PAGE_SIZE = 50;
const MAX_FETCH_PAGES = 3;
const MAX_FETCH_ERRORS = 2;
const toInputString = (val) => (val === null || val === undefined ? '' : String(val));
const isEmptyInputValue = (val) => val === '' || val === null || val === undefined;
const extractPrimitiveValue = (propValue) =>
  typeof propValue === 'object' && propValue !== null ? propValue.value : propValue;

export default function AsyncSearchSelect({
  table,
  searchColumn,
  searchColumns,
  labelFields = [],
  idField,
  value,
  onChange,
  onSelect,
  disabled,
  onKeyDown,
  inputRef,
  onFocus,
  disableAutoWidth = false,
  inputStyle = {},
  companyId,
  shouldFetch = true,
  filters = {},
  isMulti = false,
  ...rest
}) {
  const { company } = useContext(AuthContext);
  const effectiveCompanyId = companyId ?? company;
  const normalizeMultiValues = useCallback((raw) => {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item !== undefined && item !== null && item !== '')
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          if (Object.prototype.hasOwnProperty.call(item, 'value')) {
            return {
              value: item.value,
              label:
                item.label ??
                (item.value !== undefined && item.value !== null
                  ? String(item.value)
                  : ''),
            };
          }
          if (Object.prototype.hasOwnProperty.call(item, 'id')) {
            return {
              value: item.id,
              label:
                item.label ??
                (item.id !== undefined && item.id !== null ? String(item.id) : ''),
            };
          }
        }
        return { value: item, label: String(item) };
      });
  }, []);
  const initialVal = isMulti ? '' : toInputString(extractPrimitiveValue(value));
  const initialLabel =
    !isMulti && typeof value === 'object' && value !== null ? value.label ?? '' : '';
  const [input, setInput] = useState(initialVal);
  const [label, setLabel] = useState(initialLabel);
  const [options, setOptions] = useState([]);
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const match = options.find((o) => String(o.value) === String(input));
  const displayLabel = match ? match.label : label;
  const selectedList = useMemo(
    () => normalizeMultiValues(value),
    [normalizeMultiValues, value],
  );
  const internalRef = useRef(null);
  const chosenRef = useRef(null);
  const actionRef = useRef(null);
  const [tenantMeta, setTenantMeta] = useState(null);
  const [remoteDisplayFields, setRemoteDisplayFields] = useState([]);
  const [menuRect, setMenuRect] = useState(null);
  const pendingLookupRef = useRef(null);
  const forcedLocalSearchRef = useRef('');
  const fetchRequestIdRef = useRef(0);
  const fetchErrorCountRef = useRef(0);
  const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters]);
  const beginFetchRequest = useCallback(() => {
    fetchRequestIdRef.current += 1;
    return fetchRequestIdRef.current;
  }, []);
  const effectiveLabelFields = useMemo(() => {
    const set = new Set();
    const addField = (field) => {
      if (typeof field !== 'string') return;
      const trimmed = field.trim();
      if (!trimmed) return;
      set.add(trimmed);
    };
    if (Array.isArray(labelFields) && labelFields.length > 0) {
      labelFields.forEach(addField);
    }
    if (Array.isArray(remoteDisplayFields) && remoteDisplayFields.length > 0) {
      remoteDisplayFields.forEach(addField);
    }
    return Array.from(set);
  }, [labelFields, remoteDisplayFields]);
  const effectiveSearchColumns = useMemo(() => {
    const columnSet = new Set();
    const addColumn = (col) => {
      if (typeof col !== 'string') return;
      const trimmed = col.trim();
      if (trimmed.length === 0) return;
      columnSet.add(trimmed);
    };
    if (Array.isArray(searchColumns) && searchColumns.length > 0) {
      searchColumns.forEach(addColumn);
    } else if (typeof searchColumn === 'string') {
      addColumn(searchColumn);
    }
    if (typeof idField === 'string') {
      addColumn(idField);
    }
    effectiveLabelFields.forEach(addColumn);
    return Array.from(columnSet);
  }, [searchColumns, searchColumn, idField, effectiveLabelFields]);

  const findBestOption = useCallback(
    (query, { allowPartial = true } = {}) => {
      const normalized = String(query || '').trim().toLowerCase();
      if (normalized.length === 0) return null;
      let opt = options.find(
        (o) => String(o.value ?? '').toLowerCase() === normalized,
      );
      if (opt == null) {
        opt = options.find(
          (o) => String(o.label ?? '').toLowerCase() === normalized,
        );
      }
      if (opt == null && allowPartial) {
        opt = options.find((o) => {
          const valueText = String(o.value ?? '').toLowerCase();
          const labelText = String(o.label ?? '').toLowerCase();
          return (
            valueText.includes(normalized) || labelText.includes(normalized)
          );
        });
      }
      return opt || null;
    },
    [options],
  );

  const compareOptions = useCallback((a, b) => {
    const aIndex = a?.__index;
    const bIndex = b?.__index;
    const aHasIndex = aIndex !== undefined && aIndex !== null && aIndex !== '';
    const bHasIndex = bIndex !== undefined && bIndex !== null && bIndex !== '';
    if (aHasIndex && bHasIndex) {
      const aNum = Number(aIndex);
      const bNum = Number(bIndex);
      const aIsNum = Number.isFinite(aNum);
      const bIsNum = Number.isFinite(bNum);
      if (aIsNum && bIsNum && aNum !== bNum) {
        return aNum - bNum;
      }
      if (aIsNum && !bIsNum) return -1;
      if (!aIsNum && bIsNum) return 1;
      const cmp = String(aIndex).localeCompare(String(bIndex), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (cmp !== 0) return cmp;
    } else if (aHasIndex) {
      return -1;
    } else if (bHasIndex) {
      return 1;
    }

    const aVal = a?.value;
    const bVal = b?.value;
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }
    return String(aVal).localeCompare(String(bVal), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }, []);

  const normalizeOptions = useCallback(
    (list) => {
      if (!Array.isArray(list)) return [];
      const deduped = [];
      const seen = new Map();
      list.forEach((opt) => {
        if (!opt) return;
        const key =
          opt.value != null
            ? `v:${String(opt.value)}`
            : `l:${JSON.stringify(opt.label ?? opt)}`;
        if (!seen.has(key)) {
          seen.set(key, opt);
          deduped.push(opt);
        } else {
          const existing = seen.get(key);
          if (!existing.label && opt.label) {
            const idx = deduped.indexOf(existing);
            if (idx >= 0) deduped[idx] = opt;
            seen.set(key, opt);
          } else if (
            existing.__index == null &&
            opt.__index != null &&
            opt.__index !== ''
          ) {
            const idx = deduped.indexOf(existing);
            if (idx >= 0) deduped[idx] = opt;
            seen.set(key, opt);
          }
        }
      });
      return deduped.sort(compareOptions);
    },
    [compareOptions],
  );

  const updateMenuPosition = useCallback(() => {
    if (!show || !internalRef.current || typeof window === 'undefined') return;
    const rect = internalRef.current.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  }, [show]);

  useIsomorphicLayoutEffect(() => {
    if (!show) {
      setMenuRect(null);
      return;
    }
    updateMenuPosition();
  }, [show, options.length, input, updateMenuPosition]);

  useEffect(() => {
    if (!show) return;
    const handler = () => updateMenuPosition();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [show, updateMenuPosition]);

  const filterOptionsByQuery = useCallback((list, query) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return Array.isArray(list) ? list : [];
    if (!Array.isArray(list)) return [];
    return list.filter((opt) => {
      if (!opt) return false;
      const valueText = opt.value != null ? String(opt.value).toLowerCase() : '';
      const labelText = opt.label != null ? String(opt.label).toLowerCase() : '';
      return valueText.includes(normalized) || labelText.includes(normalized);
    });
  }, []);

  async function fetchPage(
    p = 1,
    q = '',
    append = false,
    signal,
    { skipRemoteSearch = false, requestId: providedRequestId } = {},
  ) {
    const requestId =
      typeof providedRequestId === 'number'
        ? providedRequestId
        : fetchRequestIdRef.current;
    const canUpdateState = () =>
      requestId === fetchRequestIdRef.current && !(signal?.aborted);
    const cols = effectiveSearchColumns;
    if (!table || cols.length === 0) return;
    if (p > MAX_FETCH_PAGES) {
      if (canUpdateState()) {
        setHasMore(false);
        setLoading(false);
      }
      return;
    }
    if (canUpdateState()) setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, perPage: PAGE_SIZE });
      const isShared =
        tenantMeta?.isShared ?? tenantMeta?.is_shared ?? false;
      const keys = getTenantKeyList(tenantMeta);
      if (!isShared) {
        if (keys.includes('company_id') && effectiveCompanyId != null)
          params.set('company_id', effectiveCompanyId);
      }
      const normalizedQuery = String(q || '').trim();
      const normalizedSearch = normalizedQuery.toLowerCase();
      if (!normalizedSearch) {
        forcedLocalSearchRef.current = '';
      }
      const forceLocalSearch =
        normalizedSearch &&
        forcedLocalSearchRef.current &&
        forcedLocalSearchRef.current === normalizedSearch;
      const shouldUseRemoteSearch =
        normalizedQuery && !skipRemoteSearch && !forceLocalSearch && cols.length > 0;
      if (shouldUseRemoteSearch) {
        params.set('search', normalizedQuery);
        params.set('searchColumns', cols.join(','));
      }
      Object.entries(filters || {}).forEach(([field, rawValue]) => {
        if (rawValue === undefined || rawValue === null || rawValue === '') return;
        params.set(field, rawValue);
      });
      const res = await safeRequest(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        { credentials: 'include', signal },
      );
      if (!res.ok) {
        throw new Error(`Failed to load ${table} options`);
      }
      const json = await res.json();
      fetchErrorCountRef.current = 0;
      if (!canUpdateState()) return;
      const rows = Array.isArray(json.rows) ? json.rows : [];
      let opts;
      try {
        opts = await buildOptionsForRows({
          table,
          rows,
          idField,
          searchColumn,
          labelFields: effectiveLabelFields,
          companyId: effectiveCompanyId,
        });
      } catch {
        const sortedFallbackRows = sortRowsByIndex(rows);
        opts = sortedFallbackRows.map((r) => {
          if (!r || typeof r !== 'object') return { value: undefined, label: '' };
          const val = r[idField || searchColumn];
          const parts = [];
          if (val !== undefined) parts.push(val);
          if (effectiveLabelFields.length === 0) {
            Object.entries(r).forEach(([k, v]) => {
              if (k === idField || k === searchColumn) return;
              if (v !== undefined && parts.length < 3) parts.push(v);
            });
          } else {
            effectiveLabelFields.forEach((f) => {
              if (r[f] !== undefined) parts.push(r[f]);
            });
          }
          const indexInfo = extractRowIndex(r);
          return {
            value: val,
            label: parts.join(' - '),
            ...(indexInfo
              ? {
                  __index: indexInfo.numeric
                    ? indexInfo.sortValue
                    : indexInfo.rawValue,
                }
              : {}),
          };
        });
      }
      let filteredOpts = opts;
      const normalizedFilter = normalizedSearch;
      if (normalizedFilter) {
        filteredOpts = filterOptionsByQuery(opts, normalizedFilter);
      }
      const totalCount = Number.isFinite(Number(json.count))
        ? Number(json.count)
        : null;
      const more =
        totalCount != null
          ? p * PAGE_SIZE < totalCount
          : rows.length >= PAGE_SIZE;
      if (!canUpdateState()) return;
      setHasMore(more);
      if (
        normalizedFilter &&
        filteredOpts.length === 0 &&
        more &&
        !signal?.aborted
      ) {
        // When a search query is active and no matches were found in the
        // current page, we fetch the next page locally. Because the previous
        // options still contain the unfiltered first page, users would see the
        // original items sitting above the upcoming matches. Clearing the
        // options before continuing ensures that the results list only contains
        // the matching items once they are loaded, regardless of which page
        // they came from.
        setOptions([]);
        const nextPage = p + 1;
        setPage(nextPage);
        return fetchPage(nextPage, q, true, signal, {
          skipRemoteSearch,
          requestId,
        });
      }
      if (
        shouldUseRemoteSearch &&
        normalizedFilter &&
        filteredOpts.length === 0 &&
        !skipRemoteSearch &&
        !signal?.aborted
      ) {
        if (!canUpdateState()) return;
        forcedLocalSearchRef.current = normalizedSearch;
        setPage(1);
        return fetchPage(1, q, false, signal, {
          skipRemoteSearch: true,
          requestId,
        });
      }
      const nextList = normalizedFilter ? filteredOpts : opts;
      if (!canUpdateState()) return;
      setOptions((prev) => {
        if (append) {
          const base = Array.isArray(prev) ? prev : [];
          return normalizeOptions([...base, ...nextList]);
        }
        return normalizeOptions(nextList);
      });
    } catch (err) {
      if (err.name !== 'AbortError' && canUpdateState()) {
        fetchErrorCountRef.current += 1;
        setOptions([]);
        if (fetchErrorCountRef.current >= MAX_FETCH_ERRORS) {
          setHasMore(false);
        }
      }
    } finally {
      if (canUpdateState()) setLoading(false);
    }
  }

  useEffect(() => {
    if (isMulti) {
      setInput('');
      setLabel('');
      forcedLocalSearchRef.current = '';
      return;
    }
    const primitiveValue = extractPrimitiveValue(value);
    if (typeof value === 'object' && value !== null) {
      setInput(toInputString(primitiveValue));
      setLabel(value.label ?? '');
    } else {
      setInput(toInputString(primitiveValue));
      if (isEmptyInputValue(primitiveValue)) setLabel('');
    }
    if (isEmptyInputValue(primitiveValue)) {
      forcedLocalSearchRef.current = '';
    }
  }, [isMulti, value]);

  useEffect(() => {
    if (!show) {
      setHighlight((h) => (options.length === 0 ? -1 : Math.min(h, options.length - 1)));
      return;
    }
    if (options.length === 0) {
      setHighlight(-1);
      return;
    }
    const query = String(input ?? '').trim();
    const fallbackIndex = options.length > 0 ? 0 : -1;
    if (!query) {
      setHighlight((h) => (h >= 0 && h < options.length ? h : fallbackIndex));
      return;
    }
    const exact = findBestOption(query, { allowPartial: false });
    const similar = exact || findBestOption(query, { allowPartial: true });
    if (!similar) {
      setHighlight(-1);
      return;
    }
    const idx = options.indexOf(similar);
    if (idx >= 0) {
      setHighlight(idx);
    } else {
      setHighlight(fallbackIndex);
    }
  }, [options, show, input, findBestOption]);

  useEffect(() => {
    if (!show) return;
    if (highlight < 0) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const collection = listEl.children;
    if (!collection || highlight >= collection.length || highlight < 0) return;
    const item = collection[highlight];
    if (!item || typeof item.offsetTop !== 'number') return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = listEl.scrollTop;
    const viewBottom = viewTop + listEl.clientHeight;
    if (itemTop < viewTop) {
      listEl.scrollTop = itemTop;
    } else if (itemBottom > viewBottom) {
      listEl.scrollTop = itemBottom - listEl.clientHeight;
    }
  }, [highlight, show]);

  useEffect(() => {
    setRemoteDisplayFields([]);
    if (!table) return undefined;
    const controller = new AbortController();
    safeRequest(`/api/display_fields?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data !== 'object') {
          setRemoteDisplayFields([]);
          return;
        }
        const fields = Array.isArray(data.displayFields)
          ? data.displayFields.filter((field) => typeof field === 'string' && field.trim())
          : [];
        setRemoteDisplayFields(fields.map((field) => field.trim()));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setRemoteDisplayFields([]);
      });
    return () => controller.abort();
  }, [table]);

  useEffect(() => {
    forcedLocalSearchRef.current = '';
  }, [table]);

  useEffect(() => {
    let canceled = false;
    setTenantMeta(null);
    if (!table) return;
    safeRequest(`/api/tenant_tables/${encodeURIComponent(table)}`, {
      credentials: 'include',
      skipErrorToast: true,
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!canceled) setTenantMeta(data || {});
      })
      .catch(() => {
        if (!canceled) setTenantMeta({});
      });
    return () => {
      canceled = true;
    };
  }, [table]);

  useEffect(() => {
    if (shouldFetch) return;
    setOptions([]);
    setHasMore(false);
    setLoading(false);
  }, [shouldFetch]);

  useEffect(() => {
    if (!shouldFetch || disabled || tenantMeta === null) return;
    const controller = new AbortController();
    const requestId = beginFetchRequest();
    fetchPage(1, '', false, controller.signal, { requestId });
    setPage(1);
    return () => controller.abort();
  }, [
    table,
    effectiveSearchColumns,
    tenantMeta,
    effectiveCompanyId,
    disabled,
    shouldFetch,
    beginFetchRequest,
    filtersKey,
  ]);

  useEffect(() => {
    if (disabled || !show || tenantMeta === null) return;
    const controller = new AbortController();
    const q = String(input || '').trim();
    setPage(1);
    const requestId = beginFetchRequest();
    fetchPage(1, q, false, controller.signal, { requestId });
    return () => controller.abort();
  }, [
    show,
    input,
    disabled,
    table,
    effectiveSearchColumns,
    tenantMeta,
    effectiveCompanyId,
    beginFetchRequest,
    filtersKey,
  ]);

  useEffect(() => {
    const pending = pendingLookupRef.current;
    if (loading || pending == null) return;
    const normalizedPending = String(pending.query || '').trim().toLowerCase();
    if (normalizedPending.length === 0) {
      pendingLookupRef.current = null;
      return;
    }
    const currentInput = String(input || '').trim().toLowerCase();
    if (currentInput !== normalizedPending) {
      pendingLookupRef.current = null;
      return;
    }
    const opt = findBestOption(pending.query, { allowPartial: false });
    if (opt) {
      onChange(opt.value, opt.label);
      setInput(String(opt.value));
      setLabel(opt.label || '');
      if (internalRef.current) internalRef.current.value = String(opt.value);
      pendingLookupRef.current = null;
      setShow(false);
    } else {
      pendingLookupRef.current = null;
    }
  }, [loading, options, input, findBestOption, onChange]);

  function handleSelectKeyDown(e) {
    actionRef.current = null;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!show) setShow(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!show) setShow(true);
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key !== 'Enter') return;

    const query = String(input || '').trim();
    if (loading || show === false) {
      actionRef.current = { type: 'enter', matched: 'pending', query };
      pendingLookupRef.current = {
        query,
      };
      return;
    }

    let idx = highlight;
    let opt = null;
    if (idx >= 0 && idx < options.length) {
      opt = options[idx];
    } else if (options.length > 0) {
      opt =
        findBestOption(query, { allowPartial: false }) ||
        findBestOption(query, { allowPartial: true });
    }

    if (opt == null) {
      actionRef.current = { type: 'enter', matched: false, query };
      return;
    }

    const optIndex = options.indexOf(opt);
    if (optIndex >= 0) setHighlight(optIndex);
    e.preventDefault();
    if (isMulti) {
      const existingSet = new Set(selectedList.map((item) => String(item.value)));
      if (!existingSet.has(String(opt.value))) {
        const next = [...selectedList.map((item) => item.value), opt.value];
        onChange(next, opt.label);
      }
      setInput('');
      setLabel('');
    } else {
      onChange(opt.value, opt.label);
      setInput(String(opt.value));
      setLabel(opt.label || '');
      if (internalRef.current) internalRef.current.value = String(opt.value);
      chosenRef.current = opt;
      actionRef.current = { type: 'enter', matched: true, option: opt, query };
      setShow(false);
      if (onSelect) {
        setTimeout(() => onSelect(opt), 0);
      }
    }
  }

  function handleBlur() {
    setTimeout(() => setShow(false), 100);
  }

  const dropdown =
    show && menuRect && typeof document !== 'undefined'
      ? createPortal(
          <div
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 2147483647,
            }}
          >
            {options.length > 0 && (
              <ul
                ref={listRef}
                onScroll={(e) => {
                  if (
                    e.target.scrollTop + e.target.clientHeight >=
                      e.target.scrollHeight - 5 &&
                    hasMore &&
                    !loading
                  ) {
                    const q = String(input || '').trim();
                    const next = page + 1;
                    setPage(next);
                    const controller = new AbortController();
                    const requestId =
                      fetchRequestIdRef.current || beginFetchRequest();
                    fetchPage(next, q, true, controller.signal, {
                      requestId,
                    });
                  }
                }}
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }}
              >
                {options.map((opt, idx) => (
                  <li
                    key={opt.value}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (isMulti) {
                        const existingSet = new Set(
                          selectedList.map((item) => String(item.value)),
                        );
                        if (!existingSet.has(String(opt.value))) {
                          const next = [...selectedList.map((item) => item.value), opt.value];
                          onChange(next, opt.label);
                        }
                        setInput('');
                        setLabel('');
                      } else {
                        onChange(opt.value, opt.label);
                        setInput(String(opt.value));
                        setLabel(opt.label || '');
                        if (internalRef.current)
                          internalRef.current.value = String(opt.value);
                        chosenRef.current = opt;
                        setShow(false);
                        if (onSelect) {
                          setTimeout(() => onSelect(opt), 0);
                        }
                      }
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    style={{
                      padding: '0.25rem',
                      background: highlight === idx ? '#eee' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label || opt.value}
                  </li>
                ))}
              </ul>
            )}
            {loading && (
              <div
                style={{
                  marginTop: options.length > 0 ? '0.25rem' : 0,
                  background: '#fff',
                  border: '1px solid #ccc',
                  padding: '0.25rem',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }}
              >
                Loading...
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', zIndex: show ? 1 : 'auto', overflow: 'visible' }}
    >
      <input
        ref={(el) => {
          internalRef.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        value={input}
        onChange={(e) => {
          pendingLookupRef.current = null;
          forcedLocalSearchRef.current = '';
          setInput(e.target.value);
          setLabel('');
          if (!isMulti) onChange(e.target.value);
          setShow(true);
          setHighlight(-1);
        }}
        onFocus={(e) => {
          setShow(true);
          if (onFocus) onFocus(e);
          if (!disableAutoWidth && !inputStyle.width) {
            e.target.style.width = 'auto';
            const max = parseFloat(inputStyle.maxWidth) || 150;
            const min = parseFloat(inputStyle.minWidth) || 60;
            const w = Math.min(e.target.scrollWidth + 2, max);
            e.target.style.width = `${Math.max(min, w)}px`;
          }
        }}
        onInput={(e) => {
          if (!disableAutoWidth && !inputStyle.width) {
            e.target.style.width = 'auto';
            const max = parseFloat(inputStyle.maxWidth) || 150;
            const min = parseFloat(inputStyle.minWidth) || 60;
            const w = Math.min(e.target.scrollWidth + 2, max);
            e.target.style.width = `${Math.max(min, w)}px`;
          }
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          handleSelectKeyDown(e);
          if (actionRef.current?.type === 'enter') {
            if (actionRef.current.matched && actionRef.current.option) {
              e.selectedOption = actionRef.current.option;
              e.lookupMatched = true;
            } else if (actionRef.current.matched === false) {
              e.lookupMatched = false;
              e.lookupQuery = actionRef.current.query;
            } else if (actionRef.current.matched === 'pending') {
              e.lookupPending = true;
              e.lookupQuery = actionRef.current.query;
            }
          } else if (chosenRef.current) {
            e.selectedOption = chosenRef.current;
            e.lookupMatched = true;
          }
          if (onKeyDown) onKeyDown(e);
          chosenRef.current = null;
          actionRef.current = null;
        }}
        disabled={disabled}
        style={{ padding: '0.5rem', ...inputStyle }}
        title={input}
        {...rest}
      />
      {isMulti && selectedList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
          {selectedList.map((item) => (
            <span
              key={String(item.value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.1rem 0.4rem',
                background: '#e5e7eb',
                borderRadius: '9999px',
                fontSize: '0.85rem',
              }}
            >
              {item.label || item.value}
              <button
                type="button"
                onClick={() => {
                  const next = selectedList
                    .filter((opt) => String(opt.value) !== String(item.value))
                    .map((opt) => opt.value);
                  onChange(next);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {dropdown}
      {!isMulti && displayLabel && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{displayLabel}</div>
      )}
    </div>
  );
}
