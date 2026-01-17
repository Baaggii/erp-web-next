import React, { useEffect, useMemo, useState } from 'react';
import normalizeSnapshotDataset from '../utils/normalizeSnapshot.js';

const DEFAULT_PER_PAGE = 50;
const PER_PAGE_OPTIONS = [25, 50, 100, 250];

function defaultFormatValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export default function ReportSnapshotViewer({
  snapshot,
  formatValue = defaultFormatValue,
  emptyMessage = 'No snapshot captured.',
  showTotalRowCount = true,
  style = {},
}) {
  const normalizedSnapshot = useMemo(
    () => normalizeSnapshotDataset(snapshot),
    [snapshot],
  );

  const initialRows = normalizedSnapshot.rows;
  const initialRowCount = normalizedSnapshot.rowCount;

  const [pageRows, setPageRows] = useState(initialRows);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [totalRows, setTotalRows] = useState(initialRowCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [artifact, setArtifact] = useState(normalizedSnapshot.artifact || null);
  const totalRow = normalizedSnapshot.totalRow;

  useEffect(() => {
    setPageRows(initialRows);
    setPage(1);
    setPerPage(DEFAULT_PER_PAGE);
    setTotalRows(initialRowCount);
    setArtifact(normalizedSnapshot.artifact || null);
    setError('');
  }, [initialRows, initialRowCount, normalizedSnapshot.artifact]);

  useEffect(() => {
    let cancelled = false;
    if (!artifact || !artifact.id) return () => {};
    const controller = new AbortController();
    async function loadPage() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('per_page', String(perPage));
        const res = await fetch(
          `/api/report_snapshot_artifacts/${encodeURIComponent(artifact.id)}?${params.toString()}`,
          { credentials: 'include', signal: controller.signal },
        );
        if (!res.ok) {
          let message = 'Failed to load snapshot rows.';
          try {
            const data = await res.json();
            if (data?.message) message = data.message;
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        const data = await res.json();
        if (!cancelled) {
          setPageRows(Array.isArray(data.rows) ? data.rows : []);
          if (typeof data.rowCount === 'number' && Number.isFinite(data.rowCount)) {
            setTotalRows(data.rowCount);
          }
        }
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load snapshot rows.');
          setPageRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadPage();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [artifact?.id, page, perPage]);

  const columns = useMemo(() => {
    if (Array.isArray(normalizedSnapshot.columns) && normalizedSnapshot.columns.length) {
      return normalizedSnapshot.columns;
    }
    if (pageRows.length > 0) {
      return Object.keys(pageRows[0]);
    }
    if (totalRow) {
      return Object.keys(totalRow);
    }
    return [];
  }, [normalizedSnapshot.columns, pageRows, totalRow]);

  const fieldTypeMap = normalizedSnapshot.fieldTypeMap || {};

  if (!columns.length && totalRows === 0 && !totalRow) {
    return <p style={style}>{emptyMessage}</p>;
  }

  const totalPages = totalRows > 0 ? Math.max(1, Math.ceil(totalRows / perPage)) : 1;
  const startRow = totalRows === 0 ? 0 : (page - 1) * perPage + 1;
  const endRow = totalRows === 0 ? 0 : startRow + pageRows.length - 1;
  const showPagination = artifact && artifact.id ? totalRows > 0 : totalRows > perPage;

  return (
    <div
      style={{
        maxHeight: '360px',
        overflow: 'auto',
        border: '1px solid #d1d5db',
        borderRadius: '0.5rem',
        marginTop: '0.5rem',
        padding: '0.5rem',
        ...style,
      }}
    >
      {artifact?.id && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
          }}
        >
          <span style={{ fontWeight: 'bold' }}>Large snapshot captured</span>
          {showTotalRowCount && (
            <span style={{ color: '#6b7280' }}>
              Showing {startRow}-{Math.max(startRow, endRow)} of {totalRows} rows.
            </span>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            Rows per page
            <select
              value={perPage}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPerPage(next);
                setPage(1);
              }}
            >
              {PER_PAGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginLeft: 'auto' }}>
            <a
              href={`/api/report_snapshot_artifacts/${encodeURIComponent(artifact.id)}?download=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download full dataset
            </a>
          </div>
        </div>
      )}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead style={{ background: '#f3f4f6' }}>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '0.25rem',
                  border: '1px solid #d1d5db',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '0.75rem', textAlign: 'center' }}>
                Loading…
              </td>
            </tr>
          ) : pageRows.length === 0 && !totalRow ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '0.75rem', textAlign: 'center' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            <>
              {pageRows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        maxWidth: '16rem',
                      }}
                    >
                      {formatValue(row?.[col], col, fieldTypeMap)}
                    </td>
                  ))}
                </tr>
              ))}
              {totalRow && (
                <tr style={{ background: '#f3f4f6', fontWeight: 'bold' }}>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: '0.25rem',
                        border: '1px solid #d1d5db',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        maxWidth: '16rem',
                      }}
                    >
                      {formatValue(totalRow?.[col], col, fieldTypeMap)}
                    </td>
                  ))}
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      {showPagination && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '0.5rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          {showTotalRowCount && (
            <span>
              Showing {startRow}-{Math.max(startRow, endRow)} of {totalRows} rows
            </span>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
