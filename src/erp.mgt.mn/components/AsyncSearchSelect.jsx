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

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  inputStyle = {},
  companyId,
  shouldFetch = true,
  ...rest
}) {
  const { company, branch, department } = useContext(AuthContext);
  const effectiveCompanyId = companyId ?? company;
  const initialVal =
    typeof value === 'object' && value !== null ? value.value : value || '';
  const initialLabel =
    typeof value === 'object' && value !== null ? value.label || '' : '';
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
  const internalRef = useRef(null);
  const chosenRef = useRef(null);
  const actionRef = useRef(null);
  const [tenantMeta, setTenantMeta] = useState(null);
  const [menuRect, setMenuRect] = useState(null);
  const pendingLookupRef = useRef(null);
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
    if (Array.isArray(labelFields)) {
      labelFields.forEach(addColumn);
    }
    return Array.from(columnSet);
  }, [searchColumns, searchColumn, idField, labelFields]);

  const findBestOption = useCallback(
    (query) => {
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
      if (opt == null) {
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

  async function fetchPage(p = 1, q = '', append = false, signal) {
    const cols = effectiveSearchColumns;
    if (!table || cols.length === 0) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, perPage: 50 });
      const isShared =
        tenantMeta?.isShared ?? tenantMeta?.is_shared ?? false;
      const keys = getTenantKeyList(tenantMeta);
      if (!isShared) {
        if (keys.includes('company_id') && effectiveCompanyId != null)
          params.set('company_id', effectiveCompanyId);
        if (keys.includes('branch_id') && branch != null)
          params.set('branch_id', branch);
        if (keys.includes('department_id') && department != null)
          params.set('department_id', department);
      }
      if (q) {
        params.set('search', q);
        params.set('searchColumns', cols.join(','));
      }
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}?${params.toString()}`,
        { credentials: 'include', signal },
      );
      const json = await res.json();
      const rows = Array.isArray(json.rows) ? json.rows : [];
      let opts;
      try {
        opts = await buildOptionsForRows({
          table,
          rows,
          idField,
          searchColumn,
          labelFields,
          companyId: effectiveCompanyId,
          branchId: branch,
          departmentId: department,
        });
      } catch {
        opts = rows.map((r) => {
          if (!r || typeof r !== 'object') return { value: undefined, label: '' };
          const val = r[idField || searchColumn];
          const parts = [];
          if (val !== undefined) parts.push(val);
          if (labelFields.length === 0) {
            Object.entries(r).forEach(([k, v]) => {
              if (k === idField || k === searchColumn) return;
              if (v !== undefined && parts.length < 3) parts.push(v);
            });
          } else {
            labelFields.forEach((f) => {
              if (r[f] !== undefined) parts.push(r[f]);
            });
          }
          return { value: val, label: parts.join(' - ') };
        });
      }
      const normalizedQuery = String(q || '').trim().toLowerCase();
      if (normalizedQuery) {
        opts = filterOptionsByQuery(opts, normalizedQuery);
      }
      const more = rows.length >= 50 && p * 50 < (json.count || Infinity);
      setHasMore(more);
      if (normalizedQuery && opts.length === 0 && more && !signal?.aborted) {
        const nextPage = p + 1;
        setPage(nextPage);
        return fetchPage(nextPage, q, true, signal);
      }
      setOptions((prev) => {
        if (append) {
          const base = Array.isArray(prev) ? prev : [];
          return [...base, ...opts];
        }
        if (normalizedQuery && opts.length === 0 && Array.isArray(prev) && prev.length > 0) {
          const fallback = filterOptionsByQuery(prev, normalizedQuery);
          if (fallback.length > 0) {
            return fallback;
          }
        }
        return opts;
      });
    } catch (err) {
      if (err.name !== 'AbortError') setOptions(append ? [] : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof value === 'object' && value !== null) {
      setInput(value.value || '');
      setLabel(value.label || '');
    } else {
      setInput(value || '');
      if (!value) setLabel('');
    }
  }, [value]);

  useEffect(() => {
    if (show && options.length > 0) setHighlight((h) => (h < 0 ? 0 : Math.min(h, options.length - 1)));
  }, [options, show]);

  useEffect(() => {
    let canceled = false;
    setTenantMeta(null);
    if (!table) return;
    fetch(`/api/tenant_tables/${encodeURIComponent(table)}`, {
      credentials: 'include',
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
    if (!shouldFetch || disabled || tenantMeta === null) return;
    const controller = new AbortController();
    fetchPage(1, '', false, controller.signal);
    setPage(1);
    return () => controller.abort();
  }, [
    table,
    effectiveSearchColumns,
    tenantMeta,
    effectiveCompanyId,
    branch,
    department,
    disabled,
    shouldFetch,
  ]);

  useEffect(() => {
    if (disabled || !show || tenantMeta === null) return;
    const controller = new AbortController();
    const q = String(input || '').trim();
    setPage(1);
    fetchPage(1, q, false, controller.signal);
    return () => controller.abort();
  }, [
    show,
    input,
    disabled,
    table,
    effectiveSearchColumns,
    tenantMeta,
    effectiveCompanyId,
    branch,
    department,
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
    const opt = findBestOption(pending.query);
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
      opt = findBestOption(query);
    }

    if (opt == null) {
      actionRef.current = { type: 'enter', matched: false, query };
      return;
    }

    const optIndex = options.indexOf(opt);
    if (optIndex >= 0) setHighlight(optIndex);
    e.preventDefault();
    onChange(opt.value, opt.label);
    if (onSelect) onSelect(opt);
    setInput(String(opt.value));
    setLabel(opt.label || '');
    if (internalRef.current) internalRef.current.value = String(opt.value);
    e.target.value = String(opt.value);
    e.selectedOption = opt;
    chosenRef.current = opt;
    actionRef.current = { type: 'enter', matched: true, option: opt };
    setShow(false);
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
                    fetchPage(next, q, true, controller.signal);
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
                    onMouseDown={() => {
                      onChange(opt.value, opt.label);
                      if (onSelect) onSelect(opt);
                      setInput(String(opt.value));
                      setLabel(opt.label || '');
                      if (internalRef.current)
                        internalRef.current.value = String(opt.value);
                      chosenRef.current = opt;
                      setShow(false);
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
          setInput(e.target.value);
          setLabel('');
          onChange(e.target.value);
          setShow(true);
          setHighlight(-1);
        }}
        onFocus={(e) => {
          setShow(true);
          if (onFocus) onFocus(e);
          e.target.style.width = 'auto';
          const max = parseFloat(inputStyle.maxWidth) || 150;
          const min = parseFloat(inputStyle.minWidth) || 60;
          const w = Math.min(e.target.scrollWidth + 2, max);
          e.target.style.width = `${Math.max(min, w)}px`;
        }}
        onInput={(e) => {
          e.target.style.width = 'auto';
          const max = parseFloat(inputStyle.maxWidth) || 150;
          const min = parseFloat(inputStyle.minWidth) || 60;
          const w = Math.min(e.target.scrollWidth + 2, max);
          e.target.style.width = `${Math.max(min, w)}px`;
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
      {dropdown}
      {displayLabel && (
        <div style={{ fontSize: '0.8rem', color: '#555' }}>{displayLabel}</div>
      )}
    </div>
  );
}
