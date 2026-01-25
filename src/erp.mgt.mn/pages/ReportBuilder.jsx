import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import buildStoredProcedure from '../utils/buildStoredProcedure.js';
import buildTenantNormalizedProcedure from '../utils/buildTenantNormalizedProcedure.js';
import buildReportSql from '../utils/buildReportSql.js';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import formatSqlValue from '../utils/formatSqlValue.js';
import parseProcedureConfig from '../../../utils/parseProcedureConfig.js';
import reportDefinitionToConfig from '../utils/reportDefinitionToConfig.js';
import fetchTenantTableOptions from '../utils/fetchTenantTableOptions.js';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';
import useHeaderMappings from '../hooks/useHeaderMappings.js';

const SESSION_PARAMS = [
  { name: 'session_company_id', type: 'INT' },
  { name: 'session_branch_id', type: 'INT' },
  { name: 'session_department_id', type: 'INT' },
  { name: 'session_position_id', type: 'INT' },
  { name: 'session_workplace_id', type: 'INT' },
  { name: 'session_user_id', type: 'VARCHAR(10)' },
  { name: 'session_senior_empid', type: 'VARCHAR(10)' },
  { name: 'session_senior_plan_empid', type: 'VARCHAR(10)' },
];

const PARAM_TYPES = ['INT', 'DATE', 'VARCHAR(50)', 'DECIMAL(10,2)'];
const AGGREGATES = ['NONE', 'SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
const OPERATORS = ['=', '>', '<', '>=', '<=', '<>'];
const CALC_OPERATORS = ['+', '-', '*', '/'];
const PAREN_OPTIONS = [0, 1, 2, 3];

function usePerTabState(initialValue, activeTab) {
  const createValue = () => {
    if (typeof initialValue === 'function') {
      return initialValue();
    }
    if (Array.isArray(initialValue)) {
      return [...initialValue];
    }
    if (initialValue && typeof initialValue === 'object') {
      return { ...initialValue };
    }
    return initialValue;
  };

  const [state, setState] = useState(() => ({
    builder: createValue(),
    code: createValue(),
  }));

  const value = state[activeTab];

  const setValue = React.useCallback(
    (updater) => {
      setState((prev) => {
        const currentValue = prev[activeTab];
        const nextValue =
          typeof updater === 'function' ? updater(currentValue) : updater;
        if (nextValue === currentValue) return prev;
        return { ...prev, [activeTab]: nextValue };
      });
    },
    [activeTab],
  );

  return [value, setValue];
}

function ReportBuilderInner() {
  const [tables, setTables] = useState([]); // list of table names
  const [tableFields, setTableFields] = useState({}); // { tableName: [field, ...] }
  const [fieldEnums, setFieldEnums] = useState({}); // { tableName: { field: [enum] } }
  const [fieldTypes, setFieldTypes] = useState({}); // { tableName: { field: type } }

  const [loading, setLoading] = useState(true);
  const generalConfig = useGeneralConfig();
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('builder');

  const [procName, setProcName] = usePerTabState('', activeTab);
  const [bulkUpdateConfig, setBulkUpdateConfig] = usePerTabState(
    () => ({ fieldName: '', defaultValue: '' }),
    activeTab,
  );
  const [fromTable, setFromTable] = usePerTabState('', activeTab);
  const [joins, setJoins] = usePerTabState(() => [], activeTab);
  const [fields, setFields] = usePerTabState(() => [], activeTab);
  const [dragItem, setDragItem] = usePerTabState(null, activeTab);
  const [groups, setGroups] = usePerTabState(() => [], activeTab);
  const [having, setHaving] = usePerTabState(() => [], activeTab);
  const [params, setParams] = usePerTabState(() => [], activeTab);
  const [conditions, setConditions] = usePerTabState(() => [], activeTab);
  const [fromFilters, setFromFilters] = usePerTabState(() => [], activeTab);
  const [unionQueries, setUnionQueries] = usePerTabState(() => [], activeTab);
  const [unionType, setUnionType] = usePerTabState('UNION', activeTab);
  const [currentUnionIndex, setCurrentUnionIndex] = usePerTabState(0, activeTab);
  const [selectSql, setSelectSql] = usePerTabState('', activeTab);
  const [viewSql, setViewSql] = usePerTabState('', activeTab);
  const [viewText, setViewText] = usePerTabState('', activeTab);
  const [procSql, setProcSql] = usePerTabState('', activeTab);
  const [error, setError] = usePerTabState('', activeTab);
  const [savedReports, setSavedReports] = usePerTabState(() => [], activeTab);
  const [selectedReport, setSelectedReport] = usePerTabState('', activeTab);
  const [procFiles, setProcFiles] = usePerTabState(() => [], activeTab);
  const [selectedProcFile, setSelectedProcFile] = usePerTabState('', activeTab);
  const [dbProcedures, setDbProcedures] = usePerTabState(() => [], activeTab);
  const [selectedDbProcedure, setSelectedDbProcedure] = usePerTabState('', activeTab);
  const [loadedProcName, setLoadedProcName] = usePerTabState('', activeTab);
  const [procFileText, setProcFileText] = usePerTabState('', activeTab);
  const [procFileIsDefault, setProcFileIsDefault] = usePerTabState(false, activeTab);
  const [dbProcIsDefault, setDbProcIsDefault] = usePerTabState(false, activeTab);
  const [isDefault, setIsDefault] = usePerTabState(false, activeTab);

  const [customParamName, setCustomParamName] = usePerTabState('', activeTab);
  const [customParamType, setCustomParamType] = usePerTabState(
    PARAM_TYPES[0],
    activeTab,
  );
  const [viewNames, setViewNames] = usePerTabState(() => [], activeTab);
  const [selectedView, setSelectedView] = usePerTabState('', activeTab);
  const [tenantTableFlags, setTenantTableFlags] = useState({});
  const [applyTenantIsolation, setApplyTenantIsolation] = useState(true);
  const { addToast } = useToast();
  const { company, permissions, session } = useContext(AuthContext);
  const { t: i18nextT } = useTranslation(['translation', 'tooltip']);
  const { t: contextT } = useContext(I18nContext);
  const t = i18nextT || contextT;
  const isAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  const isCodeTab = activeTab === 'code';
  const procLabels = generalConfig.general?.procLabels || {};
  const procHeaderMap = useHeaderMappings(
    useMemo(
      () => dbProcedures.map((p) => p?.name).filter(Boolean),
      [dbProcedures],
    ),
  );

  const formatProcDisplay = (name) => {
    const label = procHeaderMap?.[name] || procLabels[name] || '';
    if (label && label !== name) return `${label} (${name})`;
    return name;
  };

  const tenantProcedures = dbProcedures.filter((p) => !p.isDefault);
  const displayProcedures = isCodeTab
    ? dbProcedures
    : isAdmin
    ? dbProcedures
    : tenantProcedures;

  const addFilterLabel = t('reportBuilder.addFilter', 'Add Filter');
  const addConditionLabel = t('reportBuilder.addCondition', 'Add Condition');
  const paramLabel = t('reportBuilder.param', 'Param');
  const valueLabel = t('reportBuilder.value', 'Value');
  const noneLabel = t('reportBuilder.none', 'None');
  const fieldLabel = t('reportBuilder.field', 'Field');
  const aliasLabel = t('reportBuilder.alias', 'Alias');
  const defaultTag = t('reportBuilder.defaultTag', '(default)');

  useEffect(() => {
    const first = displayProcedures[0];
    setSelectedDbProcedure(first?.name || '');
    setDbProcIsDefault(first?.isDefault || false);
  }, [dbProcedures, isAdmin, isCodeTab]);

  useEffect(() => {
    setUnionQueries((prev) => {
      const arr = [...prev];
      arr[currentUnionIndex] = {
        unionType,
        fromTable,
        joins,
        fields,
        groups,
        having,
        conditions,
        fromFilters,
      };
      return arr;
    });
  }, [
    unionType,
    fromTable,
    joins,
    fields,
    groups,
    having,
    conditions,
    fromFilters,
    currentUnionIndex,
  ]);

  // Fetch table list on mount
  useEffect(() => {
    async function fetchTables() {
      try {
        const res = await fetch('/api/report_builder/tables');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Failed to load tables');
        setTables(data.tables || []);
        const first = data.tables?.[0];
        if (first) setFromTable(first);
      } catch (err) {
        console.error(err);
        setLoadError('failedToLoadTables');
      } finally {
        setLoading(false);
      }
    }
    fetchTables();
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchTenantTableOptions()
      .then((options) => {
        if (!isMounted) return;
        const map = (options || []).reduce((acc, item) => {
          if (item?.tableName) acc[item.tableName] = item;
          return acc;
        }, {});
        setTenantTableFlags(map);
      })
      .catch((err) => {
        console.error(err);
        addToast?.('Failed to load tenant table metadata', 'error');
      });
    return () => {
      isMounted = false;
    };
  }, [addToast]);

  useEffect(() => {
    if (!fromTable && tables[0]) {
      setFromTable(tables[0]);
    }
  }, [fromTable, tables, setFromTable]);

  useEffect(() => {
    const basePrefix = generalConfig?.general?.reportProcPrefix || '';
    if (!generalConfig) return;
    const procQuery = !isCodeTab && basePrefix
      ? `?prefix=${encodeURIComponent(basePrefix)}`
      : '';
    const companyQuery = isCodeTab ? '?companyId=0' : '';
    async function fetchSaved() {
      try {
        const res = await fetch(`/api/report_builder/configs${companyQuery}`);
        const data = await res.json();
        const list = data.names || [];
        setIsDefault(!!data.isDefault);
        setSavedReports(list);
        setSelectedReport(list[0] || '');
      } catch (err) {
        console.error(err);
      }
      try {
        const res = await fetch(
          `/api/report_builder/procedure-files${companyQuery}`,
        );
        const data = await res.json();
        const list = data.names || [];
        setProcFiles(list);
        setSelectedProcFile(list[0]?.name || '');
        setProcFileIsDefault(list[0]?.isDefault || false);
      } catch (err) {
        console.error(err);
      }
      try {
        const url = isCodeTab
          ? '/api/report_builder/procedures'
          : `/api/report_builder/procedures${procQuery}`;
        const res = await fetch(url);
        const data = await res.json();
        let list = data.names || [];
        if (!isCodeTab) {
          list = list.filter(({ name }) =>
            isAdmin
              ? name.startsWith(basePrefix)
              : name.startsWith(`${basePrefix}0_`) ||
                (company != null &&
                  name.startsWith(`${basePrefix}${company}_`)),
          );
        }
        setDbProcedures(list);
      } catch (err) {
        console.error(err);
      }
      await refreshViewList();
    }
    fetchSaved();
  }, [
    generalConfig?.general?.reportProcPrefix,
    company,
    isAdmin,
    isCodeTab,
  ]);

  async function refreshViewList() {
    try {
      const res = await fetch('/api/report_builder/views');
      const data = await res.json();
      const list = data.names || [];
      setViewNames(list);
      setSelectedView((prev) => (prev && list.includes(prev) ? prev : list[0] || ''));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleImport() {
    if (
      !window.confirm(
        'Importing defaults will overwrite the current configuration. Continue?'
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/config/import/report_builder?companyId=${encodeURIComponent(
          isCodeTab ? 0 : company ?? '',
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'failed');
      }
      const basePrefix = generalConfig?.general?.reportProcPrefix || '';
      const procQuery = !isCodeTab && basePrefix
        ? `?prefix=${encodeURIComponent(basePrefix)}`
        : '';
      const companyQuery = isCodeTab ? '?companyId=0' : '';
      try {
        const resCfg = await fetch(
          `/api/report_builder/configs${companyQuery}`,
        );
        const dataCfg = await resCfg.json();
        const list = dataCfg.names || [];
        setIsDefault(!!dataCfg.isDefault);
        setSavedReports(list);
        setSelectedReport(list[0] || '');
      } catch {}
      try {
        const resFiles = await fetch(
          `/api/report_builder/procedure-files${companyQuery}`,
        );
        const dataFiles = await resFiles.json();
        const list = dataFiles.names || [];
        setProcFiles(list);
        setSelectedProcFile(list[0]?.name || '');
        setProcFileIsDefault(list[0]?.isDefault || false);
      } catch {}
      try {
        const resProcs = await fetch(
          isCodeTab
            ? '/api/report_builder/procedures'
            : `/api/report_builder/procedures${procQuery}`,
        );
        const dataProcs = await resProcs.json();
        let list = dataProcs.names || [];
        if (!isCodeTab) {
          list = list.filter(({ name }) =>
            isAdmin
              ? name.startsWith(basePrefix)
              : name.startsWith(`${basePrefix}0_`) ||
                (company != null &&
                  name.startsWith(`${basePrefix}${company}_`)),
          );
        }
        setDbProcedures(list);
      } catch {}
      await refreshViewList();
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  // Ensure fields for a table are loaded
  async function ensureFields(table) {
    if (!table || tableFields[table]) return;
    try {
      const res = await fetch(
        `/api/report_builder/fields?table=${encodeURIComponent(table)}`,
      );
      const data = await res.json();
      const names = (data.fields || []).map((f) => f.name || f);
      const enums = {};
      const types = {};
      (data.fields || []).forEach((f) => {
        const key = f.name || f;
        enums[key] = f.enumValues || [];
        types[key] = f.type || '';
      });
      setTableFields((prev) => ({ ...prev, [table]: names }));
      setFieldEnums((prev) => ({ ...prev, [table]: enums }));
      setFieldTypes((prev) => ({ ...prev, [table]: types }));
    } catch (err) {
      console.error(err);
    }
  }

  // load fields when primary table changes
  useEffect(() => {
    ensureFields(fromTable);
    setFromFilters((prev) =>
      prev.map((f) => ({
        ...f,
        field: (tableFields[fromTable] || [])[0] || f.field,
      })),
    );
  }, [fromTable]);

  useEffect(() => {
    const auto = fields
      .filter((f) => f.aggregate === 'NONE' && f.table && f.field)
      .map((f) => ({ table: f.table, field: f.field }));
    setGroups((prev) => {
      const map = new Map(prev.map((g) => [`${g.table}.${g.field}`, g]));
      let changed = false;
      auto.forEach((g) => {
        const key = `${g.table}.${g.field}`;
        if (!map.has(key)) {
          map.set(key, g);
          changed = true;
        }
      });
      return changed ? Array.from(map.values()) : prev;
    });
  }, [fields]);

  const availableTables = [fromTable, ...joins.map((j) => j.table)].filter(Boolean);

  function renderParenSelect(value, onChange, side) {
    return (
      <select
        value={value || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '3rem',
          marginRight: side === 'open' ? '0.25rem' : undefined,
          marginLeft: side === 'close' ? '0.25rem' : undefined,
        }}
      >
        {PAREN_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {side === 'open' ? '('.repeat(n) : ')'.repeat(n)}
          </option>
        ))}
      </select>
    );
  }

  function addJoin() {
    const remaining = tables.filter((t) => t !== fromTable);
    const table = remaining[0] || tables[0];
    if (!table) return;
    ensureFields(table);
    const alias = `t${joins.length + 1}`;
    const targetTable = fromTable;
    setJoins([
      ...joins,
      {
        table,
        alias,
        type: 'JOIN',
        targetTable,
        conditions: [
          {
            fromField: (tableFields[targetTable] || [])[0] || '',
            toField: (tableFields[table] || [])[0] || '',
            connector: 'AND',
          },
        ],
        filters: [],
      },
    ]);
  }

  function updateJoin(index, key, value) {
    const updated = joins.map((j, i) => {
      if (i !== index) return j;
      const next = { ...j, [key]: value };
      if (key === 'table') {
        ensureFields(value);
        next.conditions = next.conditions.map((c) => ({
          ...c,
          toField: (tableFields[value] || [])[0] || '',
        }));
        next.filters = (next.filters || []).map((f) => ({
          ...f,
          field: (tableFields[value] || [])[0] || f.field,
        }));
      }
      if (key === 'targetTable') {
        ensureFields(value);
        next.conditions = next.conditions.map((c) => ({
          ...c,
          fromField: (tableFields[value] || [])[0] || '',
        }));
      }
      return next;
    });
    setJoins(updated);
  }

  function removeJoin(index) {
    setJoins(joins.filter((_, i) => i !== index));
  }

  function addJoinCondition(jIndex) {
    const j = joins[jIndex];
    ensureFields(j.targetTable);
    ensureFields(j.table);
    const newCond = {
      fromField: (tableFields[j.targetTable] || [])[0] || '',
      toField: (tableFields[j.table] || [])[0] || '',
      connector: 'AND',
      open: 0,
      close: 0,
    };
    const updated = joins.map((jn, i) =>
      i === jIndex ? { ...jn, conditions: [...jn.conditions, newCond] } : jn,
    );
    setJoins(updated);
  }

  function updateJoinCondition(jIndex, cIndex, key, value) {
    const updated = joins.map((jn, i) => {
      if (i !== jIndex) return jn;
      const conds = jn.conditions.map((c, k) =>
        k === cIndex ? { ...c, [key]: value } : c,
      );
      return { ...jn, conditions: conds };
    });
    setJoins(updated);
  }

  function removeJoinCondition(jIndex, cIndex) {
    const updated = joins.map((jn, i) =>
      i === jIndex
        ? { ...jn, conditions: jn.conditions.filter((_, k) => k !== cIndex) }
        : jn,
    );
    setJoins(updated);
  }

  function addField() {
    if (!fromTable) return;
    setFields([
      ...fields,
      {
        source: 'none',
        table: '',
        field: '',
        baseAlias: '',
        alias: '',
        aggregate: 'NONE',
        conditions: [],
        calcParts: [],
      },
    ]);
  }

  function updateField(index, key, value) {
    const updated = fields.map((f, i) => {
      if (i !== index) return f;
      const next = { ...f, [key]: value };
      if (key === 'field' && (!f.alias || f.alias === f.field)) {
        next.alias = value;
      }
      if (key === 'source') {
        if (value === 'alias') {
          next.baseAlias = '';
          next.table = '';
          next.field = '';
          next.aggregate = 'NONE';
          next.calcParts = [];
          next.alias = '';
        } else if (value === 'field') {
          const first = (tableFields[fromTable] || [])[0] || '';
          next.table = fromTable;
          next.field = first;
          if (!next.alias) next.alias = first;
          next.baseAlias = '';
          next.calcParts = [];
          ensureFields(fromTable);
        } else {
          next.baseAlias = '';
          next.table = '';
          next.field = '';
          next.aggregate = 'NONE';
          next.calcParts = [];
          next.alias = '';
        }
      }
      if (key === 'table') {
        ensureFields(value);
        next.field = (tableFields[value] || [])[0] || '';
        if (!next.alias || next.alias === f.field) {
          next.alias = next.field;
        }
      }
      if (key === 'baseAlias') {
        next.baseAlias = value;
      }
      return next;
    });
    setFields(updated);
  }

  function removeField(index) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function addFieldCondition(fIndex) {
    const table = fields[fIndex]?.table || fromTable;
    const newCond = {
      table,
      field: (tableFields[table] || [])[0] || '',
      operator: '=',
      valueType: params.length ? 'param' : 'value',
      value: '',
      param: params[0]?.name || '',
      connector: 'AND',
      open: 0,
      close: 0,
    };
    const updated = fields.map((f, i) =>
      i === fIndex ? { ...f, conditions: [...(f.conditions || []), newCond] } : f,
    );
    setFields(updated);
  }

  function updateFieldCondition(fIndex, cIndex, key, value) {
    const updated = fields.map((f, i) => {
      if (i !== fIndex) return f;
      const conds = (f.conditions || []).map((c, k) =>
        k === cIndex ? { ...c, [key]: value } : c,
      );
      if (key === 'table') ensureFields(value);
      return { ...f, conditions: conds };
    });
    setFields(updated);
  }

  function removeFieldCondition(fIndex, cIndex) {
    const updated = fields.map((f, i) =>
      i === fIndex
        ? { ...f, conditions: (f.conditions || []).filter((_, k) => k !== cIndex) }
        : f,
    );
    setFields(updated);
  }

  function addCalcPart(fIndex) {
    const parts = fields[fIndex].calcParts || [];
    const part = {
      source: 'none',
      alias: '',
      table: '',
      field: '',
      operator: '+',
    };
    const updated = fields.map((f, i) =>
      i === fIndex ? { ...f, calcParts: [...parts, part] } : f,
    );
    setFields(updated);
  }

  function updateCalcPart(fIndex, pIndex, key, value) {
    const updated = fields.map((f, i) => {
      if (i !== fIndex) return f;
      const parts = (f.calcParts || []).map((p, k) => {
        if (k !== pIndex) return p;
        const next = { ...p, [key]: value };
        if (key === 'source') {
          if (value === 'alias') {
            next.alias = fields.slice(0, fIndex).find((pf) => pf.alias)?.alias || '';
            next.table = '';
            next.field = '';
          } else if (value === 'field') {
            next.table = fromTable;
            next.field = (tableFields[fromTable] || [])[0] || '';
            next.alias = '';
          } else {
            next.alias = '';
            next.table = '';
            next.field = '';
          }
        }
        if (key === 'table') ensureFields(value);
        return next;
      });
      return { ...f, calcParts: parts };
    });
    setFields(updated);
  }

  function removeCalcPart(fIndex, pIndex) {
    const updated = fields.map((f, i) =>
      i === fIndex
        ? { ...f, calcParts: (f.calcParts || []).filter((_, k) => k !== pIndex) }
        : f,
    );
    setFields(updated);
  }

  function reorder(list, from, to) {
    const arr = [...list];
    const [moved] = arr.splice(from, 1);
    arr.splice(from < to ? to - 1 : to, 0, moved);
    return arr;
  }

  function handleDrop(type, index, parentIndex) {
    if (!dragItem || dragItem.type !== type) return;
    switch (type) {
      case 'fromFilters':
        setFromFilters(reorder(fromFilters, dragItem.index, index));
        break;
      case 'joins':
        setJoins(reorder(joins, dragItem.index, index));
        break;
      case 'joinConditions':
        if (dragItem.joinIndex === parentIndex) {
          setJoins(
            joins.map((j, ji) =>
              ji === parentIndex
                ? { ...j, conditions: reorder(j.conditions, dragItem.index, index) }
                : j,
            ),
          );
        }
        break;
      case 'joinFilters':
        if (dragItem.joinIndex === parentIndex) {
          setJoins(
            joins.map((j, ji) =>
              ji === parentIndex
                ? {
                    ...j,
                    filters: reorder(j.filters || [], dragItem.index, index),
                  }
                : j,
            ),
          );
        }
        break;
      case 'fields':
        setFields(reorder(fields, dragItem.index, index));
        break;
      case 'fieldConditions':
        if (dragItem.fieldIndex === parentIndex) {
          setFields(
            fields.map((f, fi) =>
              fi === parentIndex
                ? {
                    ...f,
                    conditions: reorder(f.conditions || [], dragItem.index, index),
                  }
                : f,
            ),
          );
        }
        break;
      case 'groups':
        setGroups(reorder(groups, dragItem.index, index));
        break;
      case 'having':
        setHaving(reorder(having, dragItem.index, index));
        break;
      case 'conditions':
        setConditions(reorder(conditions, dragItem.index, index));
        break;
      default:
        break;
    }
    setDragItem(null);
  }

  function addGroup() {
    if (!fromTable) return;
    setGroups([
      ...groups,
      { table: fromTable, field: (tableFields[fromTable] || [])[0] || '' },
    ]);
  }

  function updateGroup(index, key, value) {
    const updated = groups.map((g, i) => (i === index ? { ...g, [key]: value } : g));
    setGroups(updated);
    if (key === 'table') ensureFields(value);
  }

  function removeGroup(index) {
    setGroups(groups.filter((_, i) => i !== index));
  }

  function addHaving() {
    if (!fromTable) return;
    setHaving([
      ...having,
      {
        source: 'field',
        aggregate: 'SUM',
        table: fromTable,
        field: (tableFields[fromTable] || [])[0] || '',
        alias: '',
        operator: '=',
        valueType: params.length ? 'param' : 'value',
        param: params[0]?.name || '',
        value: '',
        connector: 'AND',
        open: 0,
        close: 0,
      },
    ]);
  }

  function updateHaving(index, key, value) {
    const updated = having.map((h, i) => {
      if (i !== index) return h;
      const next = { ...h, [key]: value };
      if (key === 'table') ensureFields(value);
      if (key === 'valueType' && value === 'param') {
        next.param = params[0]?.name || '';
      }
      if (key === 'source' && value === 'alias') {
        next.alias = fields.find((f) => f.alias)?.alias || '';
      }
      return next;
    });
    setHaving(updated);
  }

  function removeHaving(index) {
    setHaving(having.filter((_, i) => i !== index));
  }

  function toggleSessionParam(param, checked) {
    setParams((prev) =>
      checked
        ? [...prev, { ...param, source: 'session' }]
        : prev.filter((p) => p.name !== param.name),
    );
  }

  function addCustomParam() {
    if (!customParamName.trim()) return;
    setParams([
      ...params,
      { name: customParamName.trim(), type: customParamType, source: 'custom' },
    ]);
    setCustomParamName('');
  }

  function removeParam(name) {
    setParams(params.filter((p) => p.name !== name));
    setConditions(conditions.filter((c) => c.param !== name));
    setHaving(having.filter((h) => h.param !== name));
    setFromFilters(fromFilters.filter((f) => f.param !== name));
    setJoins(
      joins.map((j) => ({
        ...j,
        filters: (j.filters || []).filter((f) => f.param !== name),
      })),
    );
    setFields(
      fields.map((f) => ({
        ...f,
        conditions: (f.conditions || []).filter((c) => c.param !== name),
      })),
    );
  }

  function addCondition() {
    if (!params.length || !fromTable) return;
    const table = fromTable;
    setConditions([
      ...conditions,
      {
        table,
        field: (tableFields[table] || [])[0] || '',
        param: params[0].name,
        connector: 'AND',
        open: 0,
        close: 0,
      },
    ]);
  }

  function addRawCondition() {
    setConditions([
      ...conditions,
      { raw: '', connector: 'AND', open: 0, close: 0 },
    ]);
  }

  function updateCondition(index, key, value) {
    const updated = conditions.map((c, i) => (i === index ? { ...c, [key]: value } : c));
    setConditions(updated);
    if (key === 'table') ensureFields(value);
  }

  function removeCondition(index) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function addFromFilter() {
    if (!fromTable) return;
    setFromFilters([
      ...fromFilters,
      {
        field: (tableFields[fromTable] || [])[0] || '',
        operator: '=',
        valueType: params.length ? 'param' : 'value',
        value: '',
        param: params[0]?.name || '',
        connector: 'AND',
        open: 0,
        close: 0,
      },
    ]);
  }

  function updateFromFilter(index, key, value) {
    const updated = fromFilters.map((f, i) =>
      i === index ? { ...f, [key]: value } : f,
    );
    setFromFilters(updated);
  }

  function removeFromFilter(index) {
    setFromFilters(fromFilters.filter((_, i) => i !== index));
  }

  function addUnionQuery() {
    const newIndex = unionQueries.length;
    setUnionQueries((prev) => [
      ...prev,
      {
        unionType: 'UNION',
        fromTable,
        joins: [],
        fields: [],
        groups: [],
        having: [],
        conditions: [],
        fromFilters: [],
      },
    ]);
    setCurrentUnionIndex(newIndex);
    setJoins([]);
    setFields([]);
    setGroups([]);
    setHaving([]);
    setConditions([]);
    setFromFilters([]);
    setUnionType('UNION');
  }

  function switchUnionQuery(index) {
    const q = unionQueries[index];
    if (!q) return;
    setCurrentUnionIndex(index);
    setUnionType(q.unionType || 'UNION');
    setFromTable(q.fromTable || '');
    setJoins(q.joins || []);
    setFields(q.fields || []);
    setGroups(q.groups || []);
    setHaving(q.having || []);
    setConditions(q.conditions || []);
    setFromFilters(q.fromFilters || []);
    ensureFields(q.fromTable);
    (q.joins || []).forEach((j) => ensureFields(j.table));
  }

  function addJoinFilter(jIndex) {
    const join = joins[jIndex];
    ensureFields(join.table);
    const newFilter = {
      field: (tableFields[join.table] || [])[0] || '',
      operator: '=',
      valueType: params.length ? 'param' : 'value',
      value: '',
      param: params[0]?.name || '',
      connector: 'AND',
      open: 0,
      close: 0,
    };
    const updated = joins.map((j, i) =>
      i === jIndex ? { ...j, filters: [...(j.filters || []), newFilter] } : j,
    );
    setJoins(updated);
  }

  function updateJoinFilter(jIndex, fIndex, key, value) {
    const updated = joins.map((j, i) => {
      if (i !== jIndex) return j;
      const flts = (j.filters || []).map((f, k) =>
        k === fIndex ? { ...f, [key]: value } : f,
      );
      return { ...j, filters: flts };
    });
    setJoins(updated);
  }

  function removeJoinFilter(jIndex, fIndex) {
    const updated = joins.map((j, i) =>
      i === jIndex
        ? { ...j, filters: (j.filters || []).filter((_, k) => k !== fIndex) }
        : j,
    );
    setJoins(updated);
  }

  function buildFromState(st) {
    const { fromTable: ft, joins: js, fields: fs, groups: gs, having: hv, conditions: cs, fromFilters: ff } = st;
    const aliases = {};
    if (ft) aliases[ft] = 't0';
    const usedAliases = new Set(Object.values(aliases));
    let nextAlias = 1;

    function formatValue(val, table, field) {
      const type = (fieldTypes[table] || {})[field] || '';
      return formatSqlValue(val, type);
    }

    function buildTableFilterSql(filters, table) {
      return (filters || [])
        .filter((f) => f.field && (f.valueType === 'param' ? f.param : f.value))
        .map((f, idx) => {
          const right =
            f.valueType === 'param'
              ? `:${f.param}`
              : formatValue(f.value, table, f.field);
          const connector = idx > 0 ? ` ${f.connector} ` : '';
          const open = '('.repeat(f.open || 0);
          const close = ')'.repeat(f.close || 0);
          return `${connector}${open}${f.field} ${f.operator} ${right}${close}`;
        })
        .join('');
    }

    const joinDefs = (js || [])
      .map((j) => {
        let alias = j.alias || `t${nextAlias++}`;
        while (usedAliases.has(alias)) {
          alias = `t${nextAlias++}`;
        }
        usedAliases.add(alias);
        if (!aliases[j.table]) aliases[j.table] = alias;
        const conds = j.conditions.filter((c) => c.fromField && c.toField);
        const onInner = conds
          .map((c, idx) => {
            const connector = idx > 0 ? ` ${c.connector} ` : '';
            const open = '('.repeat(c.open || 0);
            const close = ')'.repeat(c.close || 0);
            return (
              connector +
              `${open}${aliases[j.targetTable]}.${c.fromField} = ${alias}.${c.toField}${close}`
            );
          })
          .join('');
        const on = conds.length > 1 ? `(${onInner})` : onInner;
        const tablePart = j.filters?.length
          ? `(SELECT * FROM ${j.table} WHERE ${buildTableFilterSql(j.filters, j.table)})`
          : j.table;
        return {
          table: tablePart,
          alias,
          type: j.type,
          on,
          original: j.table,
        };
      })
      .filter((j) => j.on);

    // Track tables in a case-insensitive set so comparisons ignore letter case
    const validTables = new Set(
      [ft, ...joinDefs.map((j) => j.original)]
        .filter(Boolean)
        .map((t) => t.toLowerCase()),
    );

    const fieldExprMap = {};
    const select = fs
      .filter((f) =>
        f.source === 'alias'
          ? f.baseAlias || f.calcParts?.some((p) => p.source !== 'none')
          : f.source === 'field'
          ? f.field
          : f.calcParts?.some((p) => p.source !== 'none'),
      )
      .map((f) => {
        if (
          f.source === 'field' &&
          !validTables.has((f.table || '').toLowerCase())
        ) {
          throw new Error(`Table ${f.table} is not joined`);
        }
        let base = '';
        if (f.source === 'alias') {
          base = f.baseAlias;
        } else if (f.source === 'field') {
          base = `${aliases[f.table]}.${f.field}`;
        }
        if (f.calcParts?.length) {
          const exprParts = [];
          if (base) exprParts.push(base);
          f.calcParts.forEach((p) => {
            const seg =
              p.source === 'alias'
                ? p.alias
                : p.source === 'field'
                ? `${aliases[p.table]}.${p.field}`
                : '';
            if (!seg) return;
            if (
              p.source === 'field' &&
              !validTables.has((p.table || '').toLowerCase())
            ) {
              throw new Error(`Table ${p.table} is not joined`);
            }
            if (exprParts.length) {
              exprParts.push(`${p.operator} ${seg}`);
            } else {
              exprParts.push(seg);
            }
          });
          let expr = exprParts.join(' ');
          Object.entries(fieldExprMap).forEach(([al, ex]) => {
            if (new RegExp(`\\b${al}\\b`).test(ex)) return;
            const re = new RegExp(`\\b${al}\\b`, 'g');
            expr = expr.replace(re, `(${ex})`);
          });
          if (f.alias) fieldExprMap[f.alias] = expr;
          return { expr, alias: f.alias || undefined };
        }
        if (f.aggregate && f.aggregate !== 'NONE' && f.source === 'field') {
          if (f.aggregate === 'COUNT') {
            if (f.conditions?.length) {
              const cond = f.conditions
                .filter((c) => c.field && (c.valueType === 'param' ? c.param : c.value))
                .map((c, idx) => {
                  if (!validTables.has((c.table || '').toLowerCase())) {
                    throw new Error(`Table ${c.table} is not joined`);
                  }
                  const connector = idx > 0 ? ` ${c.connector} ` : '';
                  const right =
                    c.valueType === 'param'
                      ? `:${c.param}`
                      : formatValue(c.value, c.table, c.field);
                  const open = '('.repeat(c.open || 0);
                  const close = ')'.repeat(c.close || 0);
                  return (
                    connector +
                    `${open}(${aliases[c.table]}.${c.field} ${c.operator} ${right})${close}`
                  );
                })
                .join('');
              const expr = `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`;
              if (f.alias) fieldExprMap[f.alias] = expr;
              return { expr, alias: f.alias || undefined };
            }
            const expr = 'COUNT(*)';
            if (f.alias) fieldExprMap[f.alias] = expr;
            return { expr, alias: f.alias || undefined };
          }
          if (f.conditions?.length) {
            const cond = f.conditions
              .filter((c) => c.field && (c.valueType === 'param' ? c.param : c.value))
              .map((c, idx) => {
                if (!validTables.has((c.table || '').toLowerCase())) {
                  throw new Error(`Table ${c.table} is not joined`);
                }
                const connector = idx > 0 ? ` ${c.connector} ` : '';
                const right =
                  c.valueType === 'param'
                    ? `:${c.param}`
                    : formatValue(c.value, c.table, c.field);
                const open = '('.repeat(c.open || 0);
                const close = ')'.repeat(c.close || 0);
                return (
                  connector +
                  `${open}(${aliases[c.table]}.${c.field} ${c.operator} ${right})${close}`
                );
              })
              .join('');
            const expr = `${f.aggregate}(CASE WHEN ${cond} THEN IFNULL(${base}, 0) ELSE 0 END)`;
            if (f.alias) fieldExprMap[f.alias] = expr;
            return { expr, alias: f.alias || undefined };
          }
          const expr = `${f.aggregate}(IFNULL(${base}, 0))`;
          if (f.alias) fieldExprMap[f.alias] = expr;
          return { expr, alias: f.alias || undefined };
        }
        let expr = base;
        if (f.alias) fieldExprMap[f.alias] = expr;
        return { expr, alias: f.alias || undefined };
      });

    const fromTableSql = ff.length
      ? `(SELECT * FROM ${ft} WHERE ${buildTableFilterSql(ff, ft)})`
      : ft;

    const where = cs
      .filter((c) => c.raw || (c.table && c.field && c.param))
      .map((c) => {
        if (c.raw) {
          return { expr: c.raw, connector: c.connector, open: c.open, close: c.close };
        }
        if (!validTables.has((c.table || '').toLowerCase())) {
          throw new Error(`Table ${c.table} is not joined`);
        }
        return {
          expr: `${aliases[c.table]}.${c.field} = :${c.param}`,
          connector: c.connector,
          open: c.open,
          close: c.close,
        };
      });

    const groupBy = gs
      .filter((g) => g.table && g.field)
      .map((g) => {
        if (!validTables.has((g.table || '').toLowerCase())) {
          throw new Error(`Table ${g.table} is not joined`);
        }
        return `${aliases[g.table]}.${g.field}`;
      });

    const havingDefs = hv
      .filter((h) => (h.source === 'alias' ? h.alias : h.table && h.field))
      .map((h) => {
        const left =
          h.source === 'alias'
            ? h.alias
            : `${h.aggregate}(${aliases[h.table]}.${h.field})`;
        if (
          h.source === 'field' &&
          !validTables.has((h.table || '').toLowerCase())
        ) {
          throw new Error(`Table ${h.table} is not joined`);
        }
        const right =
          h.valueType === 'param'
            ? `:${h.param}`
            : formatValue(h.value, h.table, h.field);
        return {
          expr: `${left} ${h.operator} ${right}`,
          connector: h.connector,
          open: h.open,
          close: h.close,
        };
      });

    return {
      from: { table: fromTableSql, alias: aliases[ft] },
      joins: joinDefs,
      select,
      where,
      groupBy,
      having: havingDefs,
    };
  }

  function buildDefinition() {
    const built = unionQueries.map((s) => buildFromState(s));
    const first = built[0];
    const unions = [];
    for (let i = 1; i < built.length; i++) {
      const type = unionQueries[i - 1].unionType || 'UNION';
      unions.push({ ...built[i], type });
    }
    return {
      report: { ...first, unions },
      params: params.map(({ name, type }) => ({ name, type })),
    };
  }

  function buildConfig() {
    const first = unionQueries[0] || {};
    const legacyUnions = unionQueries.slice(1).map((q, i) => ({
      ...q,
      unionType: unionQueries[i].unionType || 'UNION',
    }));
    return {
      procName,
      fromTable: first.fromTable,
      joins: first.joins,
      fields: (first.fields || []).map((f) => ({
        ...f,
        calcParts: (f.calcParts || []).filter((p) => p.source !== 'none'),
      })),
      groups: first.groups,
      having: first.having,
      params,
      conditions: first.conditions,
      fromFilters: first.fromFilters,
      unionQueries: legacyUnions,
      bulkUpdateConfig: {
        fieldName: bulkUpdateConfig?.fieldName || '',
        defaultValue:
          bulkUpdateConfig?.defaultValue === undefined ||
          bulkUpdateConfig?.defaultValue === null
            ? ''
            : bulkUpdateConfig.defaultValue,
      },
    };
  }

  function handleGenerateSql() {
    setSelectSql('');
    try {
      const { report } = buildDefinition();
      setSelectSql(buildReportSql(report));
      setError('');
    } catch (err) {
      setSelectSql('');
      setError(err.message);
    }
  }

  function handleGenerateView() {
    setViewSql('');
    setViewText('');
    try {
      const { report } = buildDefinition();
      const sql = buildReportSql(report);
      const prefix = isCodeTab
        ? ''
        : generalConfig?.general?.reportViewPrefix || '';
      if (!procName) throw new Error('procedure name is required');
      const viewName = `${prefix}${
        isCodeTab ? '' : company ? `${company}_` : ''
      }${procName}`;
      const view = `CREATE OR REPLACE VIEW ${viewName} AS\n${sql};`;
      setViewSql(view);
      setViewText(view);
      setError('');
    } catch (err) {
      setViewSql('');
      setViewText('');
      setError(err.message);
    }
  }

  function handleGenerateProc() {
    setProcSql('');
    try {
      const { report, params: p } = buildDefinition();
      const prefix = isCodeTab
        ? ''
        : generalConfig?.general?.reportProcPrefix || '';
      const config = buildConfig();
      const procedureName = isCodeTab
        ? procName
        : company
        ? `${company}_${procName}`
        : procName;
      const buildProc = applyTenantIsolation
        ? buildTenantNormalizedProcedure
        : buildStoredProcedure;
      const built = buildProc({
        name: procedureName,
        params: p,
        report,
        prefix,
        config,
        tenantTableFlags,
      });
      setProcSql(built);
      setError('');
    } catch (err) {
      setProcSql('');
      setError(err.message);
    }
  }

  function prepareViewSql(sql = '') {
    return sql.replace(/:([A-Za-z0-9_]+)/g, '@$1');
  }

  async function handlePostProc(sqlOverride, nameOverride) {
    if (sqlOverride && typeof sqlOverride.preventDefault === 'function') {
      sqlOverride = undefined;
      nameOverride = undefined;
    }
    const sqlToPost = sqlOverride ?? procSql;
    const name = nameOverride ?? procName;
    if (!sqlToPost) return;
    if (!window.confirm('POST stored procedure to database?')) return;
    const basePrefix = generalConfig?.general?.reportProcPrefix || '';
    const prefix = isCodeTab ? '' : basePrefix;
    const procQuery = !isCodeTab && prefix
      ? `?prefix=${encodeURIComponent(prefix)}`
      : '';
    try {
      const res = await fetch(`/api/report_builder/procedures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlToPost }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Save failed');
      }
      const listRes = await fetch(
        isCodeTab
          ? '/api/report_builder/procedures'
          : `/api/report_builder/procedures${procQuery}`,
      );
      if (!listRes.ok) {
        throw new Error('Failed to fetch procedures');
      }
      const data = await listRes.json();
      let list = data.names || [];
      if (!isCodeTab) {
        list = list.filter(({ name }) =>
          name.startsWith(`${basePrefix}0_`) ||
          (company != null && name.startsWith(`${basePrefix}${company}_`)),
        );
      }
      const expectedName = isCodeTab
        ? name
        : `${basePrefix}${company != null ? `${company}_` : ''}${name}`;
      if (!list.some(({ name: procName }) => procName === expectedName)) {
        throw new Error('Save failed');
      }
      setDbProcedures(list);
      setSelectedDbProcedure(list[0]?.name || '');
      setDbProcIsDefault(list[0]?.isDefault || false);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Stored procedure saved', type: 'success' },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err.message || 'Save failed', type: 'error' },
        }),
      );
    }
  }

  async function handleDeleteProcedure() {
    if (!selectedDbProcedure) return;
    if (!window.confirm(`Delete procedure ${selectedDbProcedure}?`)) return;
    try {
      const res = await fetch(
        `/api/report_builder/procedures/${encodeURIComponent(selectedDbProcedure)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Delete failed');
      }
      setDbProcedures(dbProcedures.filter((p) => p.name !== selectedDbProcedure));
      setSelectedDbProcedure('');
      setDbProcIsDefault(false);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Procedure deleted', type: 'success' },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err.message || 'Delete failed', type: 'error' },
        }),
      );
    }
  }

  async function handleLoadDbProcedure(autoApply = true) {
    if (!selectedDbProcedure) return '';
    try {
      const res = await fetch(
        `/api/report_builder/procedures/${encodeURIComponent(selectedDbProcedure)}`,
      );
      const data = await res.json();
      const sql = data.sql || '';
      setProcFileText(sql);
      setProcFileIsDefault(dbProcIsDefault);
      setLoadedProcName(selectedDbProcedure);
      if (autoApply) {
        try {
          const parsed = parseProcedureConfig(sql);
          if (parsed?.report) applyConfig(parsed.report);
        } catch (err) {
          console.error(err);
          addToast(err.message, 'error');
        }
      }
      return sql;
    } catch (err) {
      console.error(err);
      return '';
    }
  }

  function handleParseViewSql() {
    let sql = viewText || viewSql || '';
    let baseName;
    let newName;
    const nameMatch = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+`?([^`\s]+)`?/i,
    );
    if (nameMatch) {
      const basePrefix = generalConfig?.general?.reportViewPrefix || '';
      baseName = nameMatch[1];
      if (!isCodeTab) {
        if (
          basePrefix &&
          baseName.toLowerCase().startsWith(basePrefix.toLowerCase())
        ) {
          baseName = baseName.slice(basePrefix.length);
        }
        baseName = baseName.replace(/^\d+_/, '');
        newName = `${basePrefix}${company}_${baseName}`;
      } else {
        newName = baseName;
      }
      sql = sql.replace(
        /(CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+)`?[^`\s]+`?/i,
        `$1\`${newName}\``,
      );
      setProcName((prev) => prev || baseName);
    }
    setViewText(sql);
    setViewSql(sql);
    return { sql, baseName, newName };
  }

  async function handleReplaceView() {
    const { sql, newName } = handleParseViewSql();
    if (!sql || !newName) return;
    if (!window.confirm(`Replace view ${newName}?`)) return;
    const dropSql = `DROP VIEW IF EXISTS \`${newName}\`;\n${sql}`;
    await handlePostView(dropSql);
  }

  async function handlePostView(overrideSql) {
    let sqlToPost = overrideSql || viewText || viewSql;
    if (!sqlToPost && selectedView) {
      sqlToPost = await handleLoadView(selectedView);
    }
    if (!sqlToPost) return;
    if (!window.confirm('POST view to database?')) return;
    try {
      const res = await fetch('/api/report_builder/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlToPost }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Save failed');
      }
      await refreshViewList();
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'View saved', type: 'success' },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err.message || 'Save failed', type: 'error' },
        }),
      );
    }
  }

  async function handleLoadView(name = selectedView) {
    const target = name || selectedView;
    if (!target) return '';
    try {
      const res = await fetch(
        `/api/report_builder/views/${encodeURIComponent(target)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load view');
      }
      const data = await res.json();
      setViewSql(data.sql || '');
      setViewText(data.sql || '');
      setError('');
      addToast('View loaded', 'success');
      return data.sql || '';
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to load view', 'error');
      return '';
    }
  }

  async function handleDeleteView() {
    if (!selectedView) return;
    if (!window.confirm(`Delete view ${selectedView}?`)) return;
    try {
      const res = await fetch(
        `/api/report_builder/views/${encodeURIComponent(selectedView)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Delete failed');
      }
      await refreshViewList();
      setViewSql('');
      setViewText('');
      addToast('View deleted', 'success');
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Delete failed', 'error');
    }
  }

  async function handleSaveConfig() {
    const data = buildConfig();
    try {
      const basePrefix = generalConfig?.general?.reportProcPrefix || '';
      if (!procName) throw new Error('procedure name is required');
      const prefix = isCodeTab
        ? ''
        : company
        ? `${basePrefix}${company}_`
        : basePrefix;
      const name = isCodeTab ? procName : `${prefix}${procName}`;
      const companyQuery = isCodeTab ? '?companyId=0' : '';
      if (isDefault) {
        const resImport = await fetch(
          `/api/config/import?companyId=${encodeURIComponent(
            isCodeTab ? 0 : company ?? '',
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ files: ['headerMappings.json'] }),
          },
        );
        if (!resImport.ok) {
          const data = await resImport.json().catch(() => ({}));
          throw new Error(data.message || 'Import failed');
        }
        setIsDefault(false);
      }
      const res = await fetch(
        `/api/report_builder/configs/${encodeURIComponent(name)}${companyQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Save failed');
      }
      const listRes = await fetch(
        `/api/report_builder/configs${companyQuery}`,
      );
      const listData = await listRes.json();
      const list = listData.names || [];
      setIsDefault(!!listData.isDefault);
      setSavedReports(list);
      setSelectedReport(name);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Config saved', type: 'success' },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err.message || 'Save failed', type: 'error' },
        }),
      );
    }
  } 

  function applyConfig(data) {
    setProcName(data.procName || '');
    setBulkUpdateConfig({
      fieldName: data.bulkUpdateConfig?.fieldName || '',
      defaultValue:
        data.bulkUpdateConfig?.defaultValue === undefined ||
        data.bulkUpdateConfig?.defaultValue === null
          ? ''
          : data.bulkUpdateConfig.defaultValue,
    });
    const unionsRaw = data.unionQueries || [];
    const normalize = (q) => ({
      unionType: q.unionType || 'UNION',
      fromTable: q.fromTable || '',
      joins: (q.joins || []).map((j) => ({
        ...j,
        conditions: (j.conditions || []).map((c) => ({
          connector: c.connector || 'AND',
          ...c,
        })),
        filters: (j.filters || []).map((f) => ({
          connector: f.connector || 'AND',
          ...f,
        })),
      })),
      fields: (q.fields || []).map((f) => ({
        source: f.source || 'field',
        table: f.table || q.fromTable,
        field: f.field || '',
        baseAlias: f.baseAlias || '',
        alias: f.alias || '',
        aggregate: f.aggregate || 'NONE',
        calcParts: (f.calcParts || []).map((p) => ({
          operator: p.operator || '+',
          source: p.source || 'field',
          ...p,
        })),
        conditions: (f.conditions || []).map((c) => ({
          connector: c.connector || 'AND',
          ...c,
        })),
      })),
      groups: q.groups || [],
      having: (q.having || []).map((h) => ({
        connector: h.connector || 'AND',
        valueType: h.valueType || (h.param ? 'param' : 'value'),
        source: h.source || 'field',
        ...h,
      })),
      conditions: (q.conditions || []).map((c) => ({
        connector: c.connector || 'AND',
        ...c,
      })),
      fromFilters: (q.fromFilters || []).map((f) => ({
        connector: f.connector || 'AND',
        ...f,
      })),
    });
    const all = [];
    all.push(
      normalize({
        fromTable: data.fromTable,
        joins: data.joins,
        fields: data.fields,
        groups: data.groups,
        having: data.having,
        conditions: data.conditions,
        fromFilters: data.fromFilters,
        unionType: unionsRaw[0]?.unionType,
      }),
    );
    for (let i = 0; i < unionsRaw.length; i++) {
      all.push(
        normalize({
          ...unionsRaw[i],
          unionType: unionsRaw[i + 1]?.unionType,
        }),
      );
    }
    const first = all[0] || {};
    setUnionQueries(all);
    setCurrentUnionIndex(0);
    setFromTable(first.fromTable || '');
    setFromFilters(first.fromFilters || []);
    setJoins(first.joins || []);
    setFields(first.fields || []);
    setGroups(first.groups || []);
    setUnionType(first.unionType || 'UNION');
    setHaving(first.having || []);
    setParams(data.params || []);
    setConditions(first.conditions || []);
    ensureFields(first.fromTable);
    (first.joins || []).forEach((j) => {
      ensureFields(j.table);
      ensureFields(j.targetTable);
    });
  }

  async function handleLoadConfig(name) {
    const cfgName = typeof name === 'string' ? name : selectedReport;
    if (!cfgName) return;
    try {
      const res = await fetch(
        `/api/report_builder/configs/${encodeURIComponent(cfgName)}${
          isCodeTab ? '?companyId=0' : ''
        }`,
      );
      const data = await res.json();
      const raw = data.report || data;
      const cfg = raw?.select || raw?.from ? reportDefinitionToConfig(raw) : raw;
      applyConfig(cfg);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleLoadConfigFromProcedure() {
    if (!selectedDbProcedure) return;
    setSelectedReport(selectedDbProcedure);
    let sql = procFileText;
    if (!sql || loadedProcName !== selectedDbProcedure) {
      sql = await handleLoadDbProcedure(false);
    }
    let parsed;
    try {
      parsed = parseProcedureConfig(sql);
      if (parsed?.error === 'REPORT_BUILDER_CONFIG not found') {
        throw new Error('REPORT_BUILDER_CONFIG not found');
      }
    } catch (err) {
      console.error(err);
      if (err.message === 'REPORT_BUILDER_CONFIG not found') {
        try {
          const res = await fetch(
            `/api/report_builder/procedures/${encodeURIComponent(selectedDbProcedure)}/config`,
            { method: 'POST' },
          );
          const data = await res.json();
          if (data?.config?.config) {
            const raw = data.config.config;
            const cfg = raw?.select || raw?.from ? reportDefinitionToConfig(raw) : raw;
            applyConfig(cfg);
            addToast('Generated config from SQL', 'success');
          } else {
            addToast('SQL parsing failed; unable to derive config', 'error');
          }
        } catch (err2) {
          console.error(err2);
          addToast(err2.message, 'error');
        }
        return;
      }
      addToast(err.message, 'error');
      return;
    }

    if (!parsed) {
      addToast('SQL parsing failed; unable to derive config', 'error');
    } else if (parsed.report) {
      const cfg =
        parsed.report?.select || parsed.report?.from
          ? reportDefinitionToConfig(parsed.report)
          : parsed.report;
      applyConfig(cfg);
      if (parsed.converted) {
        try {
          const name = parsed.report.procName || selectedDbProcedure;
          await fetch(
            `/api/report_builder/configs/${encodeURIComponent(name)}${
              isCodeTab ? '?companyId=0' : ''
            }`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed.report),
            },
          );
          if (parsed.partial) {
            addToast('Generated config with limited clauses', 'warning');
          } else {
            addToast('Generated config from SQL', 'success');
          }
        } catch (err) {
          console.error(err);
          if (parsed.partial) {
            addToast('Generated config with limited clauses (save failed)', 'warning');
          } else {
            addToast('Generated config from SQL (save failed)', 'error');
          }
        }
      } else {
        addToast('Loaded config from embedded block', 'success');
      }
    } else if (parsed.error) {
      addToast(`SQL parsing failed: ${parsed.error}`, 'error');
    } else {
      addToast('No embedded config found in procedure', 'error');
    }
  }

  async function handleSaveProcFile() {
    if (!procSql) return;
    const basePrefix = generalConfig?.general?.reportProcPrefix || '';
    if (!procName) return;
    const prefix = isCodeTab
      ? ''
      : company
      ? `${basePrefix}${company}_`
      : basePrefix;
    const name = isCodeTab ? procName : `${prefix}${procName}`;
    const companyQuery = isCodeTab ? '?companyId=0' : '';
    try {
      const res = await fetch(
        `/api/report_builder/procedure-files/${encodeURIComponent(name)}${companyQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: procSql }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Save failed');
      }
      const listRes = await fetch(
        `/api/report_builder/procedure-files${companyQuery}`,
      );
      const listData = await listRes.json();
      const list = listData.names || [];
      setProcFiles(list);
      setSelectedProcFile(name);
      setProcFileIsDefault(false);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Procedure saved to host', type: 'success' },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: err.message || 'Save failed', type: 'error' },
        }),
      );
    }
  }

  async function handleLoadProcFile() {
    if (!selectedProcFile) return;
    try {
      const res = await fetch(
        `/api/report_builder/procedure-files/${encodeURIComponent(
          selectedProcFile,
        )}${isCodeTab ? '?companyId=0' : ''}`,
      );
      const data = await res.json();
      setProcFileText(data.sql || '');
      setProcFileIsDefault(!!data.isDefault);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleImportProcFile() {
    if (!selectedProcFile) return;
    try {
      const res = await fetch(
        `/api/report_builder/procedure-files/${encodeURIComponent(
          selectedProcFile,
        )}/import?companyId=${encodeURIComponent(
          isCodeTab ? 0 : company ?? '',
        )}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Import failed');
      }
      setProcFiles((prev) =>
        prev.map((f) =>
          f.name === selectedProcFile ? { ...f, isDefault: false } : f,
        ),
      );
      setProcFileIsDefault(false);
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  function handleParseSql() {
    let sql = procFileText || '';
    sql = sql.replace(
      /CREATE\s+DEFINER[^\n]+PROCEDURE/i,
      'CREATE PROCEDURE',
    );
    let newName;
    let baseName;
    const nameMatch = sql.match(
      /CREATE\s+PROCEDURE\s+`?([^`(]+)`?\s*\(/i,
    );
    if (nameMatch) {
      const basePrefix = generalConfig?.general?.reportProcPrefix || '';
      const oldName = nameMatch[1];
      baseName = oldName;
      if (!isCodeTab) {
        if (
          basePrefix &&
          baseName.toLowerCase().startsWith(basePrefix.toLowerCase())
        ) {
          baseName = baseName.slice(basePrefix.length);
        }
        baseName = baseName.replace(/^\d+_/, '');
        newName = `${basePrefix}${company}_${baseName}`;
      } else {
        newName = baseName;
      }
      sql = sql.replace(
        /(CREATE\s+PROCEDURE\s+)`?[^`(]+`?/i,
        `$1\`${newName}\``,
      );
      // strip any leading DROP PROCEDURE statement
      sql = sql.replace(
        /^\s*DROP\s+PROCEDURE\s+IF\s+EXISTS[^;]+;\s*/i,
        '',
      );
      // ensure the script starts with a DELIMITER block
      if (!/^\s*DELIMITER\s+\$\$/i.test(sql)) {
        sql = `DELIMITER $$\n${sql}`;
      }
      setProcName(baseName);
    }
    // ensure body terminates with END $$\nDELIMITER ;
    sql = sql.replace(/\nDELIMITER\s*;\s*$/i, '');
    sql = sql.replace(/\nEND\s*(?:\$\$)?\s*;?\s*$/i, '');
    sql = `${sql}\nEND $$\nDELIMITER ;`;
    setProcSql(sql);
    setProcFileText(sql);
    const paramsMatch = sql.match(/CREATE\s+PROCEDURE[\s\S]*?\(([^)]*)\)/i);
    if (paramsMatch) {
      const paramLines = paramsMatch[1]
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed = paramLines
        .map((line) => {
          const m = line.match(/IN\s+([\w]+)\s+([\w()]+)/i);
          return m ? { name: m[1], type: m[2] } : null;
        })
        .filter(Boolean);
      setParams(parsed);
    } else {
      setParams([]);
    }
    return { sql, baseName, newName };
  }

  async function handleReplaceProcedure() {
    const { sql, baseName, newName } = handleParseSql();
    if (
      !window.confirm(
        `Replace procedure ${newName} with the current script?`,
      )
    )
      return;
    const dropSql = `DROP PROCEDURE IF EXISTS \`${newName}\`;\n${sql}`;
    await handlePostProc(dropSql, baseName);
  }

  if (loading) {
    return <div>{t('reportBuilder.loading', 'Loading...')}</div>;
  }
  if (!tables.length) {
    return (
      <div>
        {loadError
          ? t('reportBuilder.failedToLoadTables', 'Failed to load tables')
          : t('reportBuilder.noTablesFound', 'No tables found')}
      </div>
    );
  }

  return (
    <div>
      <h2>{t('reportBuilder.title', 'Report Builder')}</h2>
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #ccc',
          marginBottom: '1rem',
        }}
      >
        {[
          { key: 'builder', label: t('reportBuilder.tabBuilder', 'Visual builder') },
          { key: 'code', label: t('reportBuilder.tabCodeDevelopment', 'Code development') },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom:
                activeTab === tab.key ? '2px solid #000' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        <div style={{ marginBottom: '0.5rem' }}>
          <button onClick={handleImport}>
            {t('reportBuilder.importDefaults', 'Import Defaults')}
          </button>
        </div>

        <section>
          <h3>{t('reportBuilder.primaryTable', 'Primary Table')}</h3>
          <select value={fromTable} onChange={(e) => setFromTable(e.target.value)}>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h3>{t('reportBuilder.primaryTableFilters', 'Primary Table Filters')}</h3>
          {fromFilters.map((f, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop('fromFilters', i)}
            >
              <span
                draggable
                onDragStart={() => setDragItem({ type: 'fromFilters', index: i })}
                style={{ cursor: 'move', marginRight: '0.5rem' }}
              >
                ☰
              </span>
              {i > 0 && (
                <select
                  value={f.connector}
                  onChange={(e) => updateFromFilter(i, 'connector', e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              {renderParenSelect(
                f.open,
                (v) => updateFromFilter(i, 'open', v),
                'open',
              )}
              <select
                value={f.field}
                onChange={(e) => updateFromFilter(i, 'field', e.target.value)}
              >
                {(tableFields[fromTable] || []).map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) => updateFromFilter(i, 'operator', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <select
                value={f.valueType}
                onChange={(e) => updateFromFilter(i, 'valueType', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                <option value="param">{paramLabel}</option>
                <option value="value">{valueLabel}</option>
              </select>
              {f.valueType === 'param' ? (
                <select
                  value={f.param}
                  onChange={(e) => updateFromFilter(i, 'param', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {params.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : fieldEnums[fromTable]?.[f.field]?.length ? (
                <select
                  value={f.value}
                  onChange={(e) => updateFromFilter(i, 'value', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value=""></option>
                  {fieldEnums[fromTable][f.field].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={f.value}
                  onChange={(e) => updateFromFilter(i, 'value', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                />
              )}
              {renderParenSelect(
                f.close,
                (v) => updateFromFilter(i, 'close', v),
                'close',
              )}
              <button
                onClick={() => removeFromFilter(i)}
                style={{ marginLeft: '0.5rem' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={addFromFilter}>{addFilterLabel}</button>
        </section>

        <section>
          <h3>{t('reportBuilder.joins', 'Joins')}</h3>
          {joins.map((j, i) => {
            const targets = [fromTable, ...joins.slice(0, i).map((jn) => jn.table)];
            return (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop('joins', i)}
              >
                <span
                  draggable
                  onDragStart={() => setDragItem({ type: 'joins', index: i })}
                  style={{ cursor: 'move', marginRight: '0.5rem' }}
                >
                  ☰
                </span>
                <select
                  value={j.type}
                  onChange={(e) => updateJoin(i, 'type', e.target.value)}
                >
                  {[
                    'JOIN',
                    'INNER JOIN',
                    'LEFT JOIN',
                    'RIGHT JOIN',
                    'FULL JOIN',
                    'FULL OUTER JOIN',
                    'CROSS JOIN',
                  ].map((jt) => (
                    <option key={jt} value={jt}>
                      {jt}
                    </option>
                  ))}
                </select>
                <select
                  value={j.table}
                  onChange={(e) => updateJoin(i, 'table', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {tables.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {' '}
                <span>{t('reportBuilder.with', 'with')} </span>
                <select
                  value={j.targetTable}
                  onChange={(e) => updateJoin(i, 'targetTable', e.target.value)}
                >
                  {targets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {j.conditions.map((c, k) => (
                  <div
                    key={k}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginLeft: '0.5rem',
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop('joinConditions', k, i)}
                  >
                    <span
                      draggable
                      onDragStart={() =>
                        setDragItem({ type: 'joinConditions', joinIndex: i, index: k })
                      }
                      style={{ cursor: 'move', marginRight: '0.5rem' }}
                    >
                      ☰
                    </span>
                    {k > 0 && (
                      <select
                        value={c.connector}
                        onChange={(e) =>
                          updateJoinCondition(i, k, 'connector', e.target.value)
                        }
                        style={{ marginRight: '0.5rem' }}
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    )}
                    {renderParenSelect(
                      c.open,
                      (v) => updateJoinCondition(i, k, 'open', v),
                      'open',
                    )}
                    <select
                      value={c.fromField}
                      onChange={(e) =>
                        updateJoinCondition(i, k, 'fromField', e.target.value)
                      }
                    >
                      {(tableFields[j.targetTable] || []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <span> = </span>
                    <select
                      value={c.toField}
                      onChange={(e) =>
                        updateJoinCondition(i, k, 'toField', e.target.value)
                      }
                    >
                      {(tableFields[j.table] || []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    {renderParenSelect(
                      c.close,
                      (v) => updateJoinCondition(i, k, 'close', v),
                      'close',
                    )}
                    <button
                      onClick={() => removeJoinCondition(i, k)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addJoinCondition(i)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {addConditionLabel}
                </button>
                {j.filters && j.filters.length > 0 && <span> | </span>}
                {j.filters?.map((f, k) => (
                  <div
                    key={k}
                    style={{ display: 'flex', alignItems: 'center', marginTop: '0.25rem' }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop('joinFilters', k, i)}
                  >
                    <span
                      draggable
                      onDragStart={() =>
                        setDragItem({ type: 'joinFilters', joinIndex: i, index: k })
                      }
                      style={{ cursor: 'move', marginRight: '0.5rem' }}
                    >
                      ☰
                    </span>
                    {k > 0 && (
                      <select
                        value={f.connector}
                        onChange={(e) =>
                          updateJoinFilter(i, k, 'connector', e.target.value)
                        }
                        style={{ marginRight: '0.5rem' }}
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    )}
                    {renderParenSelect(
                      f.open,
                      (v) => updateJoinFilter(i, k, 'open', v),
                      'open',
                    )}
                    <select
                      value={f.field}
                      onChange={(e) => updateJoinFilter(i, k, 'field', e.target.value)}
                    >
                      {(tableFields[j.table] || []).map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) => updateJoinFilter(i, k, 'operator', e.target.value)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.valueType}
                      onChange={(e) => updateJoinFilter(i, k, 'valueType', e.target.value)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <option value="param">{paramLabel}</option>
                      <option value="value">{valueLabel}</option>
                    </select>
                    {f.valueType === 'param' ? (
                      <select
                        value={f.param}
                        onChange={(e) => updateJoinFilter(i, k, 'param', e.target.value)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {params.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : fieldEnums[j.table]?.[f.field]?.length ? (
                      <select
                        value={f.value}
                        onChange={(e) => updateJoinFilter(i, k, 'value', e.target.value)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        <option value=""></option>
                        {fieldEnums[j.table][f.field].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={f.value}
                        onChange={(e) => updateJoinFilter(i, k, 'value', e.target.value)}
                        style={{ marginLeft: '0.5rem' }}
                      />
                    )}
                    {renderParenSelect(
                      f.close,
                      (v) => updateJoinFilter(i, k, 'close', v),
                      'close',
                    )}
                    <button
                      onClick={() => removeJoinFilter(i, k)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addJoinFilter(i)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {addFilterLabel}
                </button>
                <button
                  onClick={() => removeJoin(i)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button onClick={addJoin}>
            {t('reportBuilder.addJoin', 'Add Join')}
          </button>
        </section>

        <section>
          <h3>{t('reportBuilder.selectFields', 'Select Fields')}</h3>
          {fields.map((f, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop('fields', i)}
            >
              <span
                draggable
                onDragStart={() => setDragItem({ type: 'fields', index: i })}
                style={{ cursor: 'move', marginRight: '0.5rem' }}
              >
                ☰
              </span>
              <button
                onClick={() => removeField(i)}
                style={{ marginRight: '0.5rem' }}
              >
                ✕
              </button>
              <select
                value={f.source}
                onChange={(e) => updateField(i, 'source', e.target.value)}
              >
                <option value="none">{noneLabel}</option>
                <option value="field">{fieldLabel}</option>
                <option value="alias">{aliasLabel}</option>
              </select>
              {f.source === 'alias' ? (
                <select
                  value={f.baseAlias}
                  onChange={(e) => updateField(i, 'baseAlias', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value="">{noneLabel}</option>
                  {fields.slice(0, i).map((pf) =>
                    pf.alias ? (
                      <option key={pf.alias} value={pf.alias}>
                        {pf.alias}
                      </option>
                    ) : null,
                  )}
                </select>
              ) : f.source === 'field' ? (
                <>
                  <select
                    value={f.table}
                    onChange={(e) => updateField(i, 'table', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {availableTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.field}
                    onChange={(e) => updateField(i, 'field', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {(tableFields[f.table] || []).map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.aggregate}
                    onChange={(e) => updateField(i, 'aggregate', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {AGGREGATES.map((ag) => (
                      <option key={ag} value={ag}>
                        {ag}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <input
                placeholder={t('reportBuilder.aliasPlaceholder', 'alias')}
                value={f.alias}
                onChange={(e) => updateField(i, 'alias', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              />
              {(f.calcParts || []).map((p, k) => (
                <span key={k} style={{ marginLeft: '0.5rem' }}>
                  {k > 0 && (
                    <select
                      value={p.operator}
                      onChange={(e) =>
                        updateCalcPart(i, k, 'operator', e.target.value)
                      }
                      style={{ marginRight: '0.5rem' }}
                    >
                      {CALC_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  )}
                    <select
                      value={p.source}
                      onChange={(e) =>
                        updateCalcPart(i, k, 'source', e.target.value)
                      }
                    >
                      <option value="none">{noneLabel}</option>
                      <option value="field">{fieldLabel}</option>
                      <option value="alias">{aliasLabel}</option>
                    </select>
                  {p.source === 'alias' ? (
                    <select
                      value={p.alias}
                      onChange={(e) =>
                        updateCalcPart(i, k, 'alias', e.target.value)
                      }
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <option value="">{noneLabel}</option>
                      {fields.slice(0, i).map((pf) =>
                        pf.alias ? (
                          <option key={pf.alias} value={pf.alias}>
                            {pf.alias}
                          </option>
                        ) : null,
                      )}
                    </select>
                  ) : p.source === 'field' ? (
                    <>
                      <select
                        value={p.table}
                        onChange={(e) =>
                          updateCalcPart(i, k, 'table', e.target.value)
                        }
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {availableTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <select
                        value={p.field}
                        onChange={(e) =>
                          updateCalcPart(i, k, 'field', e.target.value)
                        }
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {(tableFields[p.table] || []).map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <button
                    onClick={() => removeCalcPart(i, k)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                onClick={() => addCalcPart(i)}
                style={{ marginLeft: '0.5rem' }}
              >
                {t('reportBuilder.addPart', 'Add Part')}
              </button>
              {f.source === 'field' && f.aggregate !== 'NONE' && (
                <div style={{ display: 'inline-block', marginLeft: '0.5rem' }}>
                  {(f.conditions || []).map((c, k) => (
                    <div
                      key={k}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginTop: '0.25rem',
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop('fieldConditions', k, i)}
                    >
                      <span
                        draggable
                        onDragStart={() =>
                          setDragItem({
                            type: 'fieldConditions',
                            fieldIndex: i,
                            index: k,
                          })
                        }
                        style={{ cursor: 'move', marginRight: '0.5rem' }}
                      >
                        ☰
                      </span>
                      {k > 0 && (
                        <select
                          value={c.connector}
                          onChange={(e) =>
                            updateFieldCondition(i, k, 'connector', e.target.value)
                          }
                          style={{ marginRight: '0.5rem' }}
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      )}
                      {renderParenSelect(
                        c.open,
                        (v) => updateFieldCondition(i, k, 'open', v),
                        'open',
                      )}
                      <select
                        value={c.table}
                        onChange={(e) =>
                          updateFieldCondition(i, k, 'table', e.target.value)
                        }
                      >
                        {availableTables.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <select
                        value={c.field}
                        onChange={(e) =>
                          updateFieldCondition(i, k, 'field', e.target.value)
                        }
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {(tableFields[c.table] || []).map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                      <select
                        value={c.operator}
                        onChange={(e) =>
                          updateFieldCondition(i, k, 'operator', e.target.value)
                        }
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <select
                        value={c.valueType}
                        onChange={(e) =>
                          updateFieldCondition(i, k, 'valueType', e.target.value)
                        }
                        style={{ marginLeft: '0.5rem' }}
                      >
                        <option value="param">{paramLabel}</option>
                        <option value="value">{valueLabel}</option>
                      </select>
                      {c.valueType === 'param' ? (
                        <select
                          value={c.param}
                          onChange={(e) =>
                            updateFieldCondition(i, k, 'param', e.target.value)
                          }
                          style={{ marginLeft: '0.5rem' }}
                        >
                          {params.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : fieldEnums[c.table]?.[c.field]?.length ? (
                        <select
                          value={c.value}
                          onChange={(e) =>
                            updateFieldCondition(i, k, 'value', e.target.value)
                          }
                          style={{ marginLeft: '0.5rem' }}
                        >
                          <option value=""></option>
                          {fieldEnums[c.table][c.field].map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={c.value}
                          onChange={(e) =>
                            updateFieldCondition(i, k, 'value', e.target.value)
                          }
                          style={{ marginLeft: '0.5rem' }}
                        />
                      )}
                      {renderParenSelect(
                        c.close,
                        (v) => updateFieldCondition(i, k, 'close', v),
                        'close',
                      )}
                      <button
                        onClick={() => removeFieldCondition(i, k)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addFieldCondition(i)}>
                    {addConditionLabel}
                  </button>
                </div>
              )}
            </div>
          ))}
          <button onClick={addField}>
            {t('reportBuilder.addField', 'Add Field')}
          </button>
        </section>

        <section>
          <h3>{t('reportBuilder.groupBy', 'Group By')}</h3>
          {groups.map((g, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop('groups', i)}
            >
              <span
                draggable
                onDragStart={() => setDragItem({ type: 'groups', index: i })}
                style={{ cursor: 'move', marginRight: '0.5rem' }}
              >
                ☰
              </span>
              <select
                value={g.table}
                onChange={(e) => updateGroup(i, 'table', e.target.value)}
              >
                {availableTables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={g.field}
                onChange={(e) => updateGroup(i, 'field', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                {(tableFields[g.table] || []).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeGroup(i)}
                style={{ marginLeft: '0.5rem' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={addGroup}>
            {t('reportBuilder.addGroup', 'Add Group')}
          </button>
        </section>

        <section>
          <h3>{t('reportBuilder.having', 'Having')}</h3>
          {having.map((h, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop('having', i)}
            >
              <span
                draggable
                onDragStart={() => setDragItem({ type: 'having', index: i })}
                style={{ cursor: 'move', marginRight: '0.5rem' }}
              >
                ☰
              </span>
              {i > 0 && (
                <select
                  value={h.connector}
                  onChange={(e) => updateHaving(i, 'connector', e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              {renderParenSelect(
                h.open,
                (v) => updateHaving(i, 'open', v),
                'open',
              )}
              <select
                value={h.source}
                onChange={(e) => updateHaving(i, 'source', e.target.value)}
              >
                <option value="field">{fieldLabel}</option>
                <option value="alias">{aliasLabel}</option>
              </select>
              {h.source === 'field' ? (
                <>
                  <select
                    value={h.aggregate}
                    onChange={(e) => updateHaving(i, 'aggregate', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {AGGREGATES.filter((a) => a !== 'NONE').map((ag) => (
                      <option key={ag} value={ag}>
                        {ag}
                      </option>
                    ))}
                  </select>
                  <select
                    value={h.table}
                    onChange={(e) => updateHaving(i, 'table', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {availableTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={h.field}
                    onChange={(e) => updateHaving(i, 'field', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {(tableFields[h.table] || []).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <select
                  value={h.alias}
                  onChange={(e) => updateHaving(i, 'alias', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {fields
                    .filter((f) => f.alias)
                    .map((f) => (
                      <option key={f.alias} value={f.alias}>
                        {f.alias}
                      </option>
                    ))}
                </select>
              )}
              <select
                value={h.operator}
                onChange={(e) => updateHaving(i, 'operator', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <select
                value={h.valueType}
                onChange={(e) => updateHaving(i, 'valueType', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                <option value="param">{paramLabel}</option>
                <option value="value">{valueLabel}</option>
              </select>
              {h.valueType === 'param' ? (
                <select
                  value={h.param}
                  onChange={(e) => updateHaving(i, 'param', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {params.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : h.source === 'field' && fieldEnums[h.table]?.[h.field]?.length ? (
                <select
                  value={h.value}
                  onChange={(e) => updateHaving(i, 'value', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value=""></option>
                  {fieldEnums[h.table][h.field].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={h.value}
                  onChange={(e) => updateHaving(i, 'value', e.target.value)}
                  style={{ marginLeft: '0.5rem' }}
                />
              )}
              {renderParenSelect(
                h.close,
                (v) => updateHaving(i, 'close', v),
                'close',
              )}
              <button
                onClick={() => removeHaving(i)}
                style={{ marginLeft: '0.5rem' }}
              >
                ✕
              </button>
            </div>
          ))}
          <button onClick={addHaving}>
            {t('reportBuilder.addHaving', 'Add Having')}
          </button>
        </section>

        <section>
          <h3>{t('reportBuilder.parameters', 'Parameters')}</h3>
          <div>
            {SESSION_PARAMS.map((p) => (
              <label key={p.name} style={{ marginRight: '1rem' }}>
                <input
                  type="checkbox"
                  checked={params.some((x) => x.name === p.name)}
                  onChange={(e) => toggleSessionParam(p, e.target.checked)}
                />
                {p.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <input
              placeholder={t('reportBuilder.paramNamePlaceholder', 'name')}
              value={customParamName}
              onChange={(e) => setCustomParamName(e.target.value)}
            />
            <select
              value={customParamType}
              onChange={(e) => setCustomParamType(e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              {PARAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button onClick={addCustomParam} style={{ marginLeft: '0.5rem' }}>
              {t('reportBuilder.addParam', 'Add')}
            </button>
          </div>
          <ul>
            {params
              .filter((p) => p.source === 'custom')
              .map((p) => (
                <li key={p.name}>
                  {p.name} {p.type}{' '}
                  <button onClick={() => removeParam(p.name)}>✕</button>
                </li>
              ))}
          </ul>
        </section>

        <section>
          <h3>{t('reportBuilder.conditions', 'Conditions')}</h3>
          {conditions.map((c, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop('conditions', i)}
            >
              <span
                draggable
                onDragStart={() => setDragItem({ type: 'conditions', index: i })}
                style={{ cursor: 'move', marginRight: '0.5rem' }}
              >
                ☰
              </span>
              {i > 0 && (
                <select
                  value={c.connector}
                  onChange={(e) => updateCondition(i, 'connector', e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              )}
              {c.raw ? (
                <>
                  {renderParenSelect(
                    c.open,
                    (v) => updateCondition(i, 'open', v),
                    'open',
                  )}
                  <input
                    value={c.raw}
                    onChange={(e) => updateCondition(i, 'raw', e.target.value)}
                    style={{ width: '50%' }}
                  />
                  {renderParenSelect(
                    c.close,
                    (v) => updateCondition(i, 'close', v),
                    'close',
                  )}
                  <button
                    onClick={() => removeCondition(i)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  {renderParenSelect(
                    c.open,
                    (v) => updateCondition(i, 'open', v),
                    'open',
                  )}
                  <select
                    value={c.table}
                    onChange={(e) => updateCondition(i, 'table', e.target.value)}
                  >
                    {availableTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={c.field}
                    onChange={(e) => updateCondition(i, 'field', e.target.value)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {(tableFields[c.table] || []).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <span> = </span>
                  <select
                    value={c.param}
                    onChange={(e) => updateCondition(i, 'param', e.target.value)}
                  >
                    {params.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {renderParenSelect(
                    c.close,
                    (v) => updateCondition(i, 'close', v),
                    'close',
                  )}
                  <button
                    onClick={() => removeCondition(i)}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
          <button onClick={addCondition} disabled={!params.length}>
            {addConditionLabel}
          </button>
          <button onClick={addRawCondition} style={{ marginLeft: '0.5rem' }}>
            {t('reportBuilder.addRawCondition', 'Add Raw Condition')}
          </button>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{ marginRight: '0.5rem' }}>
              {t('reportBuilder.unionAddedCount', 'Added: {{count}}', {
                count: Math.max(0, unionQueries.length - 1),
              })}
            </span>
            <select
              value={unionType}
              onChange={(e) => setUnionType(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            >
              <option value="UNION">UNION</option>
              <option value="UNION ALL">UNION ALL</option>
            </select>
            <button onClick={addUnionQuery} style={{ marginRight: '0.5rem' }}>
              {t('reportBuilder.addUnion', 'Add UNION')}
            </button>
            {unionQueries.map((_, idx) => (
              <button
                key={idx}
                onClick={() => switchUnionQuery(idx)}
                style={{
                  marginRight: '0.25rem',
                  fontWeight: currentUnionIndex === idx ? 'bold' : undefined,
                }}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginTop: '1rem' }}>
          <label>
            {t('reportBuilder.procedureName', 'Procedure Name')}:
            <div>
              {!isCodeTab &&
                `${generalConfig?.general?.reportProcPrefix || ''}${
                  company ? `${company}_` : ''
                }`}
              <input
                value={procName}
                onChange={(e) => setProcName(e.target.value)}
                style={{ width: '50%' }}
              />
              {!isCodeTab && generalConfig?.general?.reportProcSuffix}
            </div>
          </label>
        </section>

        <section style={{ marginTop: '1rem' }}>
          <h3>{t('reportBuilder.bulkUpdateDefaults', 'Bulk update defaults')}</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              {t('reportBuilder.bulkUpdateField', 'Field to update')}
              <input
                type="text"
                value={bulkUpdateConfig?.fieldName || ''}
                onChange={(e) =>
                  setBulkUpdateConfig((prev) => ({
                    ...prev,
                    fieldName: e.target.value,
                  }))
                }
                placeholder={t(
                  'reportBuilder.bulkUpdateFieldPlaceholder',
                  'e.g. status',
                )}
                style={{ minWidth: '16rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column' }}>
              {t('reportBuilder.bulkUpdateValue', 'Default value')}
              <input
                type="text"
                value={bulkUpdateConfig?.defaultValue ?? ''}
                onChange={(e) =>
                  setBulkUpdateConfig((prev) => ({
                    ...prev,
                    defaultValue: e.target.value,
                  }))
                }
                placeholder={t(
                  'reportBuilder.bulkUpdateValuePlaceholder',
                  'e.g. Completed',
                )}
                style={{ minWidth: '16rem' }}
              />
            </label>
          </div>
        </section>

        <section style={{ marginTop: '1rem' }}>
          <h3>{t('reportBuilder.generate', 'Generate')}</h3>
          <button onClick={handleGenerateSql}>
            {t('reportBuilder.createSql', 'Create SQL')}
          </button>
          <button onClick={handleGenerateView} style={{ marginLeft: '0.5rem' }}>
            {t('reportBuilder.createView', 'Create View')}
          </button>
          <button onClick={handleGenerateProc} style={{ marginLeft: '0.5rem' }}>
            {t('reportBuilder.createProcedure', 'Create Procedure')}
          </button>
          <label style={{ marginLeft: '0.75rem' }}>
            <input
              type="checkbox"
              checked={applyTenantIsolation}
              onChange={(e) => setApplyTenantIsolation(e.target.checked)}
              style={{ marginRight: '0.25rem' }}
            />
            {t('reportBuilder.applyTenantIsolation', 'Apply tenant isolation')}
          </label>
        </section>

        {isCodeTab && (
          <section style={{ marginTop: '1rem' }}>
            <h3>{t('reportBuilder.viewList', 'Views')}</h3>
            <select
              value={selectedView}
              onChange={(e) => setSelectedView(e.target.value)}
            >
              {viewNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={handleLoadView}
              style={{ marginLeft: '0.5rem' }}
              disabled={!selectedView}
            >
              {t('reportBuilder.loadView', 'Load View')}
            </button>
            <button
              onClick={handleDeleteView}
              style={{ marginLeft: '0.5rem' }}
              disabled={!selectedView}
            >
              {t('reportBuilder.deleteView', 'Delete View')}
            </button>
          </section>
        )}

        {(viewSql || viewText) && (
          <section style={{ marginTop: '1rem' }}>
            <h3>{t('reportBuilder.viewHeading', 'View')}</h3>
            <div style={{ marginBottom: '0.5rem' }}>
              <button onClick={handlePostView}>
                {t('reportBuilder.postView', 'POST View')}
              </button>
              <button
                onClick={handleParseViewSql}
                style={{ marginLeft: '0.5rem' }}
              >
                {t('reportBuilder.parseViewSql', 'Parse View SQL')}
              </button>
              <button
                onClick={handleReplaceView}
                style={{ marginLeft: '0.5rem' }}
              >
                {t('reportBuilder.replaceView', 'Replace View')}
              </button>
            </div>
            <textarea
              value={viewText || viewSql}
              onChange={(e) => {
                setViewText(e.target.value);
                setViewSql(e.target.value);
              }}
              rows={8}
              style={{ width: '100%' }}
            />
          </section>
        )}

        <section style={{ marginTop: '1rem' }}>
          <h3>{t('reportBuilder.storedProcedure', 'Stored Procedure')}</h3>
          {procSql && (
            <button onClick={handlePostProc} disabled={procFileIsDefault}>
              {t('reportBuilder.postProcedure', 'POST Procedure')}
            </button>
          )}
          <button
            onClick={handleSaveProcFile}
            style={{ marginLeft: '0.5rem' }}
            disabled={procFileIsDefault}
          >
            {t('reportBuilder.saveToHost', 'Save to Host')}
          </button>
          <select
            value={selectedProcFile}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedProcFile(val);
              const item = procFiles.find((f) => f.name === val);
              setProcFileIsDefault(item?.isDefault || false);
            }}
            style={{ marginLeft: '0.5rem' }}
          >
            {procFiles.map((f) => (
              <option key={f.name} value={f.name}>
                {f.isDefault ? `${f.name} ${defaultTag}` : f.name}
              </option>
            ))}
          </select>
          <button onClick={handleLoadProcFile} style={{ marginLeft: '0.5rem' }}>
            {t('reportBuilder.loadFromHost', 'Load from Host')}
          </button>
          {procFileIsDefault && (
            <button
              onClick={handleImportProcFile}
              style={{ marginLeft: '0.5rem' }}
            >
              {t('reportBuilder.importDefaultProcedure', 'Import default procedure')}
            </button>
          )}
          <select
            value={selectedDbProcedure}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedDbProcedure(val);
              const item = dbProcedures.find((p) => p.name === val);
              setDbProcIsDefault(item?.isDefault || false);
            }}
            style={{ marginLeft: '0.5rem' }}
          >
            {displayProcedures.map((p) => (
              <option key={p.name} value={p.name}>
                {formatProcDisplay(p.name)}
              </option>
            ))}
          </select>
          <button
            onClick={handleLoadDbProcedure}
            style={{ marginLeft: '0.5rem' }}
          >
            {t('reportBuilder.loadScript', 'Load Script')}
          </button>
          <button
            onClick={handleLoadConfigFromProcedure}
            style={{ marginLeft: '0.5rem' }}
          >
            {t(
              'reportBuilder.loadConfigFromProcedure',
              'Load config from stored procedure',
            )}
          </button>
          <button
            onClick={handleDeleteProcedure}
            style={{ marginLeft: '0.5rem' }}
            disabled={dbProcIsDefault}
          >
            {t('reportBuilder.deleteProcedure', 'Delete Procedure')}
          </button>
        </section>

        {procFileText && isCodeTab && (
          <section style={{ marginTop: '1rem' }}>
            <h3>{t('reportBuilder.editLoadedSql', 'Edit Loaded SQL')}</h3>
            <textarea
              value={procFileText}
              onChange={(e) => setProcFileText(e.target.value)}
              rows={8}
              style={{ width: '100%' }}
              readOnly={procFileIsDefault}
            />
            {procFileIsDefault && (
              <div style={{ marginTop: '0.25rem', color: 'red' }}>
                {t(
                  'reportBuilder.defaultFileReadonly',
                  'Default file is read-only. Import to edit.',
                )}
              </div>
            )}
            <button onClick={handleParseSql} style={{ marginTop: '0.5rem' }}>
              {t('reportBuilder.parseSql', 'Parse SQL')}
            </button>
            <button
              onClick={handleReplaceProcedure}
              style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}
              disabled={procFileIsDefault}
            >
              {t('reportBuilder.replaceProcedure', 'Replace Procedure')}
            </button>
          </section>
        )}

        <section style={{ marginTop: '1rem' }}>
          <h3>{t('reportBuilder.config', 'Config')}</h3>
          <button onClick={handleSaveConfig}>
            {t('reportBuilder.saveConfig', 'Save Config')}
          </button>
          <select
            value={selectedReport}
            onChange={(e) => setSelectedReport(e.target.value)}
            style={{ marginLeft: '0.5rem' }}
          >
            {savedReports.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button onClick={() => handleLoadConfig()} style={{ marginLeft: '0.5rem' }}>
            {t('reportBuilder.loadConfig', 'Load Config')}
          </button>
        </section>

        {error && <p style={{ color: 'red' }}>{error}</p>}
        {selectSql && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{selectSql}</pre>
        )}
        {viewSql && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{viewSql}</pre>
        )}
        {procSql && (
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{procSql}</pre>
        )}
      </div>
    </div>
  );
}


export default function ReportBuilder(props) {
  return (
    <ErrorBoundary>
      <ReportBuilderInner {...props} />
    </ErrorBoundary>
  );
}
