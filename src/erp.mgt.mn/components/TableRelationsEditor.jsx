import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useTranslation } from 'react-i18next';

function normalizeColumns(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.COLUMN_NAME) return item.COLUMN_NAME;
      if (item?.column_name) return item.column_name;
      if (item?.name) return item.name;
      if (item?.Field) return item.Field;
      return '';
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function buildRelationSummary(relations, customRelationsMap = {}) {
  if (!Array.isArray(relations)) return [];
  return relations
    .filter((rel) => rel && rel.COLUMN_NAME)
    .map((rel, order) => {
      if (rel?.source !== 'custom') return { ...rel, __order: order };
      const customList = customRelationsMap?.[rel.COLUMN_NAME];
      const match =
        Array.isArray(customList) && Number.isInteger(rel?.configIndex)
          ? customList[rel.configIndex]
          : null;
      if (!match || typeof match !== 'object') return { ...rel, __order: order };
      return {
        ...rel,
        ...(match.idField ? { idField: match.idField } : {}),
        ...(Array.isArray(match.displayFields)
          ? { displayFields: match.displayFields }
          : {}),
        ...(match.combinationSourceColumn && !rel.combinationSourceColumn
          ? { combinationSourceColumn: match.combinationSourceColumn }
          : {}),
        ...(match.combinationTargetColumn && !rel.combinationTargetColumn
          ? { combinationTargetColumn: match.combinationTargetColumn }
          : {}),
        ...(match.filterColumn ? { filterColumn: match.filterColumn } : {}),
        ...(match.filterValue !== undefined && match.filterValue !== null
          ? { filterValue: match.filterValue }
          : {}),
        __order: order,
      };
    })
    .sort((a, b) => {
      const col = a.COLUMN_NAME.localeCompare(b.COLUMN_NAME);
      if (col !== 0) return col;
      if (a.source === b.source) {
        const indexA = Number.isInteger(a.configIndex) ? a.configIndex : a.__order;
        const indexB = Number.isInteger(b.configIndex) ? b.configIndex : b.__order;
        return indexA - indexB;
      }
      if (a.source === 'custom') return -1;
      if (b.source === 'custom') return 1;
      return a.__order - b.__order;
    })
    .map((rel) => {
      const { __order, ...rest } = rel;
      return rest;
    });
}

function normalizeCustomRelationsMap(relations) {
  if (!relations || typeof relations !== 'object') return {};
  const result = {};
  for (const [column, entry] of Object.entries(relations)) {
    if (Array.isArray(entry)) {
      const normalized = entry
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          if (!item.table || !item.column) return null;
          const normalizedEntry = {
            table: item.table,
            column: item.column,
          };
          if (item.idField) normalizedEntry.idField = item.idField;
          if (Array.isArray(item.displayFields)) {
            normalizedEntry.displayFields = [...item.displayFields];
          }
          const comboSource =
            item.combinationSourceColumn ?? item.combination_source_column;
          const comboTarget =
            item.combinationTargetColumn ?? item.combination_target_column;
          if (
            typeof comboSource === 'string' &&
            comboSource.trim() &&
            typeof comboTarget === 'string' &&
            comboTarget.trim()
          ) {
            normalizedEntry.combinationSourceColumn = comboSource.trim();
            normalizedEntry.combinationTargetColumn = comboTarget.trim();
          }
          const filterColumn = item.filterColumn ?? item.filter_column;
          const filterValue = item.filterValue ?? item.filter_value;
          if (
            typeof filterColumn === 'string' &&
            filterColumn.trim() &&
            filterValue !== undefined &&
            filterValue !== null &&
            String(filterValue).trim()
          ) {
            normalizedEntry.filterColumn = filterColumn.trim();
            normalizedEntry.filterValue = String(filterValue).trim();
          }
          return normalizedEntry;
        })
        .filter(Boolean);
      if (normalized.length > 0) {
        result[column] = normalized;
      }
    } else if (entry && typeof entry === 'object' && entry.table && entry.column) {
      result[column] = [
        {
          table: entry.table,
          column: entry.column,
          ...(entry.idField ? { idField: entry.idField } : {}),
          ...(Array.isArray(entry.displayFields)
            ? { displayFields: [...entry.displayFields] }
            : {}),
          ...(entry.combinationSourceColumn
            ? { combinationSourceColumn: entry.combinationSourceColumn }
            : {}),
          ...(entry.combinationTargetColumn
            ? { combinationTargetColumn: entry.combinationTargetColumn }
            : {}),
          ...(entry.filterColumn ? { filterColumn: entry.filterColumn } : {}),
          ...(entry.filterValue ? { filterValue: entry.filterValue } : {}),
        },
      ];
    }
  }
  return result;
}

export default function TableRelationsEditor({ table }) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [columns, setColumns] = useState([]);
  const [tables, setTables] = useState([]);
  const [relations, setRelations] = useState([]);
  const [customRelations, setCustomRelations] = useState({});
  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedRelationIndex, setSelectedRelationIndex] = useState(null);
  const [targetTable, setTargetTable] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [targetColumnsCache, setTargetColumnsCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [isDefaultConfig, setIsDefaultConfig] = useState(true);
  const [combinationSource, setCombinationSource] = useState('');
  const [combinationTarget, setCombinationTarget] = useState('');
  const [targetFilterColumn, setTargetFilterColumn] = useState('');
  const [targetFilterValue, setTargetFilterValue] = useState('');

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.localeCompare(b)), [columns]);
  const sortedTables = useMemo(() => [...tables].sort((a, b) => a.localeCompare(b)), [tables]);
  const summaryRelations = useMemo(() => buildRelationSummary(relations), [relations]);
  const currentTargetColumns = targetColumnsCache[targetTable]?.columns || [];
  const currentTargetColumnMeta = targetColumnsCache[targetTable]?.meta || {};
  const selectedCustomRelations = useMemo(() => {
    const list = customRelations?.[selectedColumn];
    return Array.isArray(list) ? list : [];
  }, [customRelations, selectedColumn]);
  const selectedCustomMapping = useMemo(() => {
    if (!Number.isInteger(selectedRelationIndex)) return null;
    return selectedCustomRelations[selectedRelationIndex] ?? null;
  }, [selectedCustomRelations, selectedRelationIndex]);
  const hasSelectedCustomMapping = Boolean(selectedCustomMapping);
  const canSave = useMemo(
    () => Boolean(selectedColumn && targetTable && targetColumn),
    [selectedColumn, targetTable, targetColumn],
  );
  const selectionHint = useMemo(() => {
    if (canSave) return '';
    if (!selectedColumn) return 'Select a source column to get started.';
    if (!targetTable) return 'Choose the target table for the relationship.';
    if (!targetColumn)
      return 'Pick a column from the target table to finish the mapping.';
    return '';
  }, [canSave, selectedColumn, targetColumn, targetTable]);

  const loadData = useCallback(async () => {
    if (!table) {
      setColumns([]);
      setTables([]);
      setRelations([]);
      setCustomRelations({});
      setTargetColumnsCache({});
      setSelectedColumn('');
      setSelectedRelationIndex(null);
      setTargetTable('');
      setTargetColumn('');
      setCombinationSource('');
      setCombinationTarget('');
      setTargetFilterColumn('');
      setTargetFilterValue('');
      return;
    }
    setLoading(true);
    try {
      const encoded = encodeURIComponent(table);
      const [colsRes, tablesRes, relRes, customRes] = await Promise.all([
        fetch(`/api/tables/${encoded}/columns`, { credentials: 'include' }),
        fetch('/api/tables', { credentials: 'include' }),
        fetch(`/api/tables/${encoded}/relations`, { credentials: 'include' }),
        fetch(`/api/tables/${encoded}/relations/custom`, {
          credentials: 'include',
        }),
      ]);
      if (!colsRes.ok || !tablesRes.ok || !relRes.ok || !customRes.ok) {
        throw new Error('Failed to load relation metadata');
      }
      const [colsJson, tablesJson, relationsJson, customJson] = await Promise.all([
        colsRes.json().catch(() => []),
        tablesRes.json().catch(() => []),
        relRes.json().catch(() => []),
        customRes.json().catch(() => ({})),
      ]);
      const normalizedColumns = normalizeColumns(colsJson);
      setTables(Array.isArray(tablesJson) ? tablesJson.filter(Boolean) : []);
      setRelations(Array.isArray(relationsJson) ? relationsJson : []);
      const customMap =
        customJson && typeof customJson === 'object'
          ? customJson.relations ?? customJson
          : {};
      const normalizedCustom = normalizeCustomRelationsMap(customMap);
      const mergedColumns = Array.from(
        new Set([...normalizedColumns, ...Object.keys(normalizedCustom)]),
      ).sort((a, b) => a.localeCompare(b));
      setColumns(mergedColumns);
      setCustomRelations(normalizedCustom);
      setIsDefaultConfig(Boolean(customJson?.isDefault ?? true));
      setTargetColumnsCache({});
      setSelectedColumn('');
      setSelectedRelationIndex(null);
      setTargetTable('');
      setTargetColumn('');
      setCombinationSource('');
      setCombinationTarget('');
      setTargetFilterColumn('');
      setTargetFilterValue('');
    } catch (err) {
      console.error('Failed to load table relations configuration', err);
      addToast(
        t('failed_load_table_relations', 'Failed to load table relations'),
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [addToast, table, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ensureTargetColumns = useCallback(
    async (tbl) => {
      if (!tbl) return [];
      if (targetColumnsCache[tbl]) return targetColumnsCache[tbl].columns;
      try {
        const encoded = encodeURIComponent(tbl);
        const res = await fetch(`/api/tables/${encoded}/columns`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load target columns');
        const json = await res.json().catch(() => []);
        const normalizedColumns = normalizeColumns(json);
        const metaMap = {};
        if (Array.isArray(json)) {
          json.forEach((col) => {
            const name =
              typeof col === 'string'
                ? col
                : col?.COLUMN_NAME || col?.column_name || col?.name || col?.Field;
            if (name) {
              metaMap[name] = col;
            }
          });
        }
        setTargetColumnsCache((prev) => ({
          ...prev,
          [tbl]: { columns: normalizedColumns, meta: metaMap },
        }));
        return normalizedColumns;
      } catch (err) {
        console.error('Failed to load target table columns', err);
        addToast('Failed to load target table columns', 'error');
        return [];
      }
    },
    [addToast, targetColumnsCache],
  );

  const startEdit = useCallback(
    async (column, relation = null, relationIndex = null) => {
      setSelectedColumn(column);
      if (!column) {
        setSelectedRelationIndex(null);
        setTargetTable('');
        setTargetColumn('');
        return;
      }

      const resolvedIndex = Number.isInteger(relationIndex)
        ? relationIndex
        : Number.isInteger(relation?.configIndex)
        ? relation.configIndex
        : null;
      let resolvedRelation = relation;

      if (!resolvedRelation && resolvedIndex !== null) {
        const list = Array.isArray(customRelations?.[column])
          ? customRelations[column]
          : [];
        resolvedRelation = list[resolvedIndex] ?? null;
      }

      if (resolvedRelation && resolvedRelation.table && resolvedRelation.column) {
        setSelectedRelationIndex(resolvedIndex);
        setTargetTable(resolvedRelation.table);
        await ensureTargetColumns(resolvedRelation.table);
        setTargetColumn(resolvedRelation.column);
        setCombinationSource(resolvedRelation.combinationSourceColumn || '');
        setCombinationTarget(resolvedRelation.combinationTargetColumn || '');
        setTargetFilterColumn(resolvedRelation.filterColumn || '');
        setTargetFilterValue(
          resolvedRelation.filterValue !== undefined && resolvedRelation.filterValue !== null
            ? String(resolvedRelation.filterValue)
            : '',
        );
        return;
      }

      if (relation && relation.REFERENCED_TABLE_NAME) {
        const tbl = relation.REFERENCED_TABLE_NAME || relation.table || '';
        const col = relation.REFERENCED_COLUMN_NAME || relation.column || '';
        setSelectedRelationIndex(null);
        setTargetTable(tbl);
        await ensureTargetColumns(tbl);
        setTargetColumn(col);
        setCombinationSource(relation.combinationSourceColumn || '');
        setCombinationTarget(relation.combinationTargetColumn || '');
        setTargetFilterColumn(relation.filterColumn || '');
        setTargetFilterValue(
          relation.filterValue !== undefined && relation.filterValue !== null
            ? String(relation.filterValue)
            : '',
        );
        return;
      }

      setSelectedRelationIndex(null);
      setTargetTable('');
      setTargetColumn('');
      setCombinationSource('');
      setCombinationTarget('');
      setTargetFilterColumn('');
      setTargetFilterValue('');
    },
    [customRelations, ensureTargetColumns],
  );

  const handleTargetTableChange = useCallback(
    async (value) => {
      setTargetTable(value);
      setTargetColumn('');
      setTargetFilterColumn('');
      setTargetFilterValue('');
      if (value) {
        await ensureTargetColumns(value);
      }
    },
    [ensureTargetColumns],
  );

  const handleSave = useCallback(async () => {
    if (!selectedColumn) {
      addToast('Select a source column to configure', 'error');
      return;
    }
    if (!targetTable) {
      addToast('Select a target table', 'error');
      return;
    }
    if (!targetColumn) {
      addToast('Select a target column', 'error');
      return;
    }
    if (targetFilterColumn && !targetFilterValue) {
      addToast('Enter a filter value for the selected target field', 'error');
      return;
    }
    setSaving(true);
    try {
      const currentColumn = selectedColumn;
      const editingExisting = Number.isInteger(selectedRelationIndex);
      const res = await fetch(
        `/api/tables/${encodeURIComponent(table)}/relations/custom/${encodeURIComponent(
          selectedColumn,
        )}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetTable,
            targetColumn,
            ...(combinationSource && combinationTarget
              ? {
                  combinationSourceColumn: combinationSource,
                  combinationTargetColumn: combinationTarget,
                }
              : {}),
            ...(targetFilterColumn && targetFilterValue
              ? {
                  filterColumn: targetFilterColumn,
                  filterValue: targetFilterValue,
                }
              : {}),
            ...(editingExisting ? { index: selectedRelationIndex } : {}),
          }),
        },
      );
      if (!res.ok) {
        throw new Error('Failed to save relation');
      }
      const json = await res.json().catch(() => ({}));
      addToast('Saved relation mapping', 'success');
      await loadData();
      if (currentColumn) {
        const nextIndex =
          Number.isInteger(json?.index) && editingExisting ? json.index : null;
        await startEdit(currentColumn, null, nextIndex);
      }
    } catch (err) {
      console.error('Failed to save custom relation', err);
      addToast('Failed to save relation mapping', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    addToast,
    combinationSource,
    combinationTarget,
    loadData,
    selectedColumn,
    selectedRelationIndex,
    startEdit,
    table,
    targetColumn,
    targetTable,
  ]);

  const handleDelete = useCallback(
    async (column, relationIndex = null) => {
      if (!column) return;
      const deleteKey = `${column}:${
        Number.isInteger(relationIndex) ? relationIndex : 'all'
      }`;
      setDeletingKey(deleteKey);
      const params = new URLSearchParams();
      if (Number.isInteger(relationIndex) && relationIndex >= 0) {
        params.set('index', String(relationIndex));
      }
      try {
        const res = await fetch(
          `/api/tables/${encodeURIComponent(table)}/relations/custom/${encodeURIComponent(
            column,
          )}${params.toString() ? `?${params.toString()}` : ''}`,
          { method: 'DELETE', credentials: 'include' },
        );
        if (!res.ok) {
          throw new Error('Failed to delete relation');
        }
        await res.json().catch(() => ({}));
        addToast('Removed custom relation', 'success');
        await loadData();
        if (selectedColumn === column) {
          await startEdit(column);
        }
      } catch (err) {
        console.error('Failed to delete custom relation', err);
        addToast('Failed to remove relation', 'error');
      } finally {
        setDeletingKey('');
      }
    },
    [addToast, loadData, selectedColumn, startEdit, table],
  );

  const beginNewMapping = useCallback(() => {
    if (!selectedColumn) return;
    setSelectedRelationIndex(null);
    setTargetTable('');
    setTargetColumn('');
    setCombinationSource('');
    setCombinationTarget('');
    setTargetFilterColumn('');
    setTargetFilterValue('');
  }, [selectedColumn]);

  const filterMeta = targetFilterColumn ? currentTargetColumnMeta[targetFilterColumn] : null;
  const filterEnumValues = Array.isArray(filterMeta?.enumValues) ? filterMeta.enumValues : [];

  return (
    <div className="table-relations-editor">
      <h3>Table Relations</h3>
      {table ? (
        <p>
          Editing relations for <strong>{table}</strong>
          {!isDefaultConfig ? ' (customized)' : ''}
        </p>
      ) : (
        <p>Select a table to configure relations.</p>
      )}
      {loading && (
        <p data-testid="relations-loading">Loading relations…</p>
      )}
      {!loading && (
        <>
          <div>
            <h4>Existing Relations</h4>
            {summaryRelations.length === 0 ? (
              <p data-testid="relations-empty">No relations defined.</p>
            ) : (
              <table className="relations-summary" data-testid="relations-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Target Table</th>
                    <th>Target Column</th>
                    <th>Source</th>
                    <th>Combination Source</th>
                    <th>Combination Target</th>
                    <th>Filter Column</th>
                    <th>Filter Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRelations.map((rel, idx) => {
                    const rowKey = `${rel.COLUMN_NAME}-${rel.source}-${
                      rel.source === 'custom'
                        ? Number.isInteger(rel.configIndex)
                          ? rel.configIndex
                          : 'custom'
                        : idx
                    }`;
                    const isDeleting = deletingKey === `${rel.COLUMN_NAME}:${rel.configIndex ?? 'all'}`;
                    return (
                      <tr
                        key={rowKey}
                        data-testid={`relation-row-${rowKey}`}
                      >
                        <td>{rel.COLUMN_NAME}</td>
                        <td>{rel.REFERENCED_TABLE_NAME || '-'}</td>
                        <td>{rel.REFERENCED_COLUMN_NAME || '-'}</td>
                        <td>{rel.source === 'custom' ? 'Custom' : 'Database'}</td>
                        <td>{rel.combinationSourceColumn || '-'}</td>
                        <td>{rel.combinationTargetColumn || '-'}</td>
                        <td>{rel.filterColumn || '-'}</td>
                        <td>
                          {rel.filterValue !== undefined && rel.filterValue !== null && rel.filterValue !== ''
                            ? rel.filterValue
                            : '-'}
                        </td>
                        <td>
                          <button
                            type="button"
                            data-testid={`relation-edit-${rowKey}`}
                            onClick={() =>
                              startEdit(
                                rel.COLUMN_NAME,
                                rel,
                                Number.isInteger(rel.configIndex) ? rel.configIndex : null,
                              )
                            }
                          >
                            Edit
                          </button>
                          {rel.source === 'custom' && (
                            <button
                              type="button"
                              data-testid={`relation-delete-${rowKey}`}
                              onClick={() =>
                                handleDelete(
                                  rel.COLUMN_NAME,
                                  Number.isInteger(rel.configIndex) ? rel.configIndex : null,
                                )
                              }
                              disabled={isDeleting}
                            >
                              {isDeleting ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h4>Add or Update Relation</h4>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Source Column
                <select
                  value={selectedColumn}
                  data-testid="relations-column-select"
                  onChange={(e) => startEdit(e.target.value)}
                >
                  <option value="">-- Select column --</option>
                  {sortedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Target Table
                <select
                  value={targetTable}
                  data-testid="relations-target-table"
                  onChange={(e) => handleTargetTableChange(e.target.value)}
                >
                  <option value="">-- Select table --</option>
                  {sortedTables.map((tbl) => (
                    <option key={tbl} value={tbl}>
                      {tbl}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Target Column
                <select
                  value={targetColumn}
                  data-testid="relations-target-column"
                  onChange={(e) => setTargetColumn(e.target.value)}
                >
                  <option value="">-- Select column --</option>
                  {currentTargetColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Target Field Filter (optional)
                <select
                  value={targetFilterColumn}
                  data-testid="relations-target-filter-column"
                  onChange={(e) => {
                    setTargetFilterColumn(e.target.value);
                    setTargetFilterValue('');
                  }}
                >
                  <option value="">-- No filter --</option>
                  {currentTargetColumns.map((col) => (
                    <option key={`filter-${col}`} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {targetFilterColumn && (
              <div style={{ marginBottom: '0.5rem' }}>
                {filterEnumValues.length > 0 ? (
                  <label>
                    Filter Value
                    <select
                      value={targetFilterValue}
                      data-testid="relations-target-filter-enum"
                      onChange={(e) => setTargetFilterValue(e.target.value)}
                    >
                      <option value="">-- Select value --</option>
                      {filterEnumValues.map((val) => (
                        <option key={`enum-${val}`} value={val}>
                          {val}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Filter Value
                    <input
                      type="text"
                      data-testid="relations-target-filter-value"
                      value={targetFilterValue}
                      onChange={(e) => setTargetFilterValue(e.target.value)}
                      placeholder="Enter filter value"
                    />
                  </label>
                )}
              </div>
            )}
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Combination Source Column (optional)
                <select
                  value={combinationSource}
                  data-testid="relations-combo-source"
                  onChange={(e) => setCombinationSource(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {sortedColumns.map((col) => (
                    <option key={`source-${col}`} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                Combination Target Column (optional)
                <select
                  value={combinationTarget}
                  data-testid="relations-combo-target"
                  onChange={(e) => setCombinationTarget(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {currentTargetColumns.map((col) => (
                    <option key={`target-${col}`} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectionHint && (
              <p
                style={{
                  margin: '0 0 0.5rem',
                  color: '#555',
                  fontSize: '0.85rem',
                }}
              >
                {selectionHint}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                data-testid="relations-save"
                onClick={handleSave}
                disabled={saving || !canSave}
                style={{
                  opacity: saving || !canSave ? 0.6 : 1,
                  cursor: saving || !canSave ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Relation'}
              </button>
              {hasSelectedCustomMapping && (
                <button
                  type="button"
                  data-testid="relations-form-delete"
                  onClick={() => handleDelete(selectedColumn, selectedRelationIndex)}
                  disabled={deletingKey === `${selectedColumn}:${selectedRelationIndex}`}
                >
                  {deletingKey === `${selectedColumn}:${selectedRelationIndex}`
                    ? 'Removing…'
                    : 'Remove Selected Mapping'}
                </button>
              )}
              {selectedColumn && (
                <button
                  type="button"
                  data-testid="relations-form-new"
                  onClick={beginNewMapping}
                  disabled={saving}
                >
                  Add Another Target
                </button>
              )}
            </div>
            {hasSelectedCustomMapping && (
              <p
                style={{
                  marginTop: '0.5rem',
                  color: '#555',
                  fontSize: '0.85rem',
                }}
              >
                Editing custom mapping #{selectedRelationIndex + 1} for {selectedColumn}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
