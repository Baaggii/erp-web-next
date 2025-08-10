import React, { useEffect, useState } from 'react';
import buildStoredProcedure from '../utils/buildStoredProcedure.js';
import buildReportSql from '../utils/buildReportSql.js';

const SESSION_PARAMS = [
  { name: 'session_branch_id', type: 'INT' },
  { name: 'session_user_id', type: 'VARCHAR(10)' },
  { name: 'session_company_id', type: 'INT' },
];

const PARAM_TYPES = ['INT', 'DATE', 'VARCHAR(50)', 'DECIMAL(10,2)'];
const AGGREGATES = ['NONE', 'SUM', 'COUNT', 'MAX', 'MIN'];
const OPERATORS = ['=', '>', '<', '>=', '<=', '<>'];
const CALC_OPERATORS = ['+', '-', '*', '/'];

export default function ReportBuilder() {
  const [tables, setTables] = useState([]); // list of table names
  const [tableFields, setTableFields] = useState({}); // { tableName: [field, ...] }
  const [fieldEnums, setFieldEnums] = useState({}); // { tableName: { field: [enum] } }

  const [procName, setProcName] = useState('');
  const [fromTable, setFromTable] = useState('');
  const [joins, setJoins] = useState([]); // {table, alias, type, targetTable, conditions:[{fromField,toField,connector}], filters:[]}
  const [fields, setFields] = useState([]); // {source:'field'|'alias', table, field, baseAlias, alias, aggregate, conditions:[], calcParts:[{source,table,field,alias,operator}]}
  const [dragIndex, setDragIndex] = useState(null);
  const [groups, setGroups] = useState([]); // {table, field}
  const [having, setHaving] = useState([]); // {source:'field'|'alias', aggregate, table, field, alias, operator, valueType, value, param, connector}
  const [params, setParams] = useState([]); // {name,type,source}
  const [conditions, setConditions] = useState([]); // {table,field,param,connector}
  const [fromFilters, setFromFilters] = useState([]); // {field,operator,valueType,param,value,connector,open,close}
  const [unionQueries, setUnionQueries] = useState([]); // array of prior query states
  const [selectSql, setSelectSql] = useState('');
  const [viewSql, setViewSql] = useState('');
  const [procSql, setProcSql] = useState('');
  const [error, setError] = useState('');
  const [savedReports, setSavedReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState('');
  const [procFiles, setProcFiles] = useState([]);
  const [selectedProcFile, setSelectedProcFile] = useState('');
  const [procFileText, setProcFileText] = useState('');

  const [customParamName, setCustomParamName] = useState('');
  const [customParamType, setCustomParamType] = useState(PARAM_TYPES[0]);

  // Fetch table list on mount
  useEffect(() => {
    async function fetchTables() {
      try {
        const res = await fetch('/api/report_builder/tables');
        const data = await res.json();
        setTables(data.tables || []);
        const first = data.tables?.[0];
        if (first) setFromTable(first);
      } catch (err) {
        console.error(err);
      }
    }
    fetchTables();
    async function fetchSaved() {
      try {
        const res = await fetch('/api/report_builder/configs');
        const data = await res.json();
        setSavedReports(data.names || []);
        setSelectedReport(data.names?.[0] || '');
      } catch (err) {
        console.error(err);
      }
      try {
        const res = await fetch('/api/report_builder/procedure-files');
        const data = await res.json();
        setProcFiles(data.names || []);
        setSelectedProcFile(data.names?.[0] || '');
      } catch (err) {
        console.error(err);
      }
    }
    fetchSaved();
  }, []);

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
      (data.fields || []).forEach((f) => {
        enums[f.name || f] = f.enumValues || [];
      });
      setTableFields((prev) => ({ ...prev, [table]: names }));
      setFieldEnums((prev) => ({ ...prev, [table]: enums }));
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
    const firstField = (tableFields[fromTable] || [])[0] || '';
    setFields([
      ...fields,
      {
        source: 'field',
        table: fromTable,
        field: firstField,
        baseAlias: '',
        alias: firstField,
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
          next.baseAlias =
            fields.slice(0, index).find((pf) => pf.alias)?.alias || '';
        } else {
          const first = (tableFields[fromTable] || [])[0] || '';
          next.table = fromTable;
          next.field = first;
          if (!next.alias) next.alias = first;
          next.baseAlias = '';
          ensureFields(fromTable);
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
      source: 'alias',
      alias: fields.slice(0, fIndex).find((pf) => pf.alias)?.alias || '',
      table: fromTable,
      field: (tableFields[fromTable] || [])[0] || '',
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
          } else {
            next.table = fromTable;
            next.field = (tableFields[fromTable] || [])[0] || '';
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

  function handleFieldDrop(index) {
    if (dragIndex === null) return;
    const updated = [...fields];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setFields(updated);
    setDragIndex(null);
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
    const snapshot = {
      fromTable,
      joins,
      fields,
      groups,
      having,
      conditions,
      fromFilters,
    };
    setUnionQueries([...unionQueries, snapshot]);
    setJoins([]);
    setFields([]);
    setGroups([]);
    setHaving([]);
    setConditions([]);
    setFromFilters([]);
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
    (js || []).forEach((j, i) => {
      aliases[j.table] = j.alias || `t${i + 1}`;
    });

    function buildTableFilterSql(filters) {
      return (filters || [])
        .filter((f) => f.field && (f.valueType === 'param' ? f.param : f.value))
        .map((f, idx) => {
          const right = f.valueType === 'param' ? `:${f.param}` : f.value;
          const connector = idx > 0 ? ` ${f.connector} ` : '';
          const open = '('.repeat(f.open || 0);
          const close = ')'.repeat(f.close || 0);
          return `${connector}${open}${f.field} ${f.operator} ${right}${close}`;
        })
        .join('');
    }

    const joinDefs = (js || [])
      .map((j) => {
        const conds = j.conditions.filter((c) => c.fromField && c.toField);
        const onInner = conds
          .map(
            (c, idx) =>
              (idx > 0 ? ` ${c.connector} ` : '') +
              `${aliases[j.targetTable]}.${c.fromField} = ${aliases[j.table]}.${c.toField}`,
          )
          .join('');
        const on = conds.length > 1 ? `(${onInner})` : onInner;
        const tablePart = j.filters?.length
          ? `(SELECT * FROM ${j.table} WHERE ${buildTableFilterSql(j.filters)})`
          : j.table;
        return {
          table: tablePart,
          alias: aliases[j.table],
          type: j.type,
          on,
          original: j.table,
        };
      })
      .filter((j) => j.on);

    const validTables = new Set([ft, ...joinDefs.map((j) => j.original)]);

    const fieldExprMap = {};
    const select = fs
      .filter((f) => (f.source === 'alias' ? f.baseAlias : f.field))
      .map((f) => {
        if (f.source === 'field' && !validTables.has(f.table)) {
          throw new Error(`Table ${f.table} is not joined`);
        }
        let base =
          f.source === 'alias'
            ? f.baseAlias
            : `${aliases[f.table]}.${f.field}`;
        if (f.calcParts?.length) {
          const exprParts = [base];
          f.calcParts.forEach((p) => {
            const seg =
              p.source === 'alias'
                ? p.alias
                : `${aliases[p.table]}.${p.field}`;
            if (!seg) return;
            if (p.source === 'field' && !validTables.has(p.table)) {
              throw new Error(`Table ${p.table} is not joined`);
            }
            exprParts.push(`${p.operator} ${seg}`);
          });
          let expr = exprParts.join(' ');
          Object.entries(fieldExprMap).forEach(([al, ex]) => {
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
                  if (!validTables.has(c.table)) {
                    throw new Error(`Table ${c.table} is not joined`);
                  }
                  const connector = idx > 0 ? ` ${c.connector} ` : '';
                  const right = c.valueType === 'param' ? `:${c.param}` : c.value;
                  return (
                    connector +
                    `(${aliases[c.table]}.${c.field} ${c.operator} ${right})`
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
                if (!validTables.has(c.table)) {
                  throw new Error(`Table ${c.table} is not joined`);
                }
                const connector = idx > 0 ? ` ${c.connector} ` : '';
                const right = c.valueType === 'param' ? `:${c.param}` : c.value;
                return (
                  connector +
                  `(${aliases[c.table]}.${c.field} ${c.operator} ${right})`
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
      ? `(SELECT * FROM ${ft} WHERE ${buildTableFilterSql(ff)})`
      : ft;

    const where = cs
      .filter((c) => c.raw || (c.table && c.field && c.param))
      .map((c) => {
        if (c.raw) {
          return { expr: c.raw, connector: c.connector, open: c.open, close: c.close };
        }
        if (!validTables.has(c.table)) {
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
        if (!validTables.has(g.table)) {
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
        if (h.source === 'field' && !validTables.has(h.table)) {
          throw new Error(`Table ${h.table} is not joined`);
        }
        const right = h.valueType === 'param' ? `:${h.param}` : h.value;
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

  function buildDefinition(includeCurrent = true) {
    const states = includeCurrent
      ? [...unionQueries, { fromTable, joins, fields, groups, having, conditions, fromFilters }]
      : [...unionQueries];
    const reports = states.map((s) => buildFromState(s));
    const [first, ...rest] = reports;
    return {
      report: { ...first, unions: rest },
      params: params.map(({ name, type }) => ({ name, type })),
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
    try {
      const { report } = buildDefinition();
      const sql = buildReportSql(report);
      const view = `CREATE OR REPLACE VIEW view_${procName || 'report'} AS\n${sql};`;
      setViewSql(view);
      setError('');
    } catch (err) {
      setViewSql('');
      setError(err.message);
    }
  }

  function handleGenerateProc() {
    setProcSql('');
    try {
      const { report, params: p } = buildDefinition();
      const built = buildStoredProcedure({
        name: procName || 'report',
        params: p,
        report,
      });
      setProcSql(built);
      setError('');
    } catch (err) {
      setProcSql('');
      setError(err.message);
    }
  }

  async function handlePostProc() {
    if (!procSql) return;
    if (!window.confirm('POST stored procedure to database?')) return;
    try {
      const res = await fetch('/api/report_builder/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: procSql }),
      });
      if (!res.ok) throw new Error('Save failed');
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

  async function handlePostView() {
    if (!viewSql) return;
    if (!window.confirm('POST view to database?')) return;
    try {
      const res = await fetch('/api/report_builder/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: viewSql }),
      });
      if (!res.ok) throw new Error('Save failed');
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

  async function handleSaveConfig() {
    const data = {
      procName,
      fromTable,
      joins,
      fields,
      groups,
      having,
      params,
      conditions,
      fromFilters,
      unionQueries,
    };
    try {
      const name = procName || 'report';
      const res = await fetch(
        `/api/report_builder/configs/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error('Save failed');
      const listRes = await fetch('/api/report_builder/configs');
      const listData = await listRes.json();
      setSavedReports(listData.names || []);
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

  async function handleLoadConfig() {
    if (!selectedReport) return;
    try {
      const res = await fetch(
        `/api/report_builder/configs/${encodeURIComponent(selectedReport)}`,
      );
      const data = await res.json();
        setProcName(data.procName || '');
        setFromTable(data.fromTable || '');
        setFromFilters(
          (data.fromFilters || []).map((f) => ({
            connector: f.connector || 'AND',
            ...f,
          })),
        );
        setJoins(
          (data.joins || []).map((j) => ({
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
        );
        setFields(
          (data.fields || []).map((f) => ({
            source: f.source || 'field',
            table: f.table || fromTable,
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
        );
        setGroups(data.groups || []);
        setUnionQueries(data.unionQueries || []);
        setHaving(
          (data.having || []).map((h) => ({
            connector: h.connector || 'AND',
            valueType: h.valueType || (h.param ? 'param' : 'value'),
            source: h.source || 'field',
            ...h,
          })),
        );
        setParams(data.params || []);
        setConditions(
          (data.conditions || []).map((c) => ({
            connector: c.connector || 'AND',
            ...c,
          })),
        );
        ensureFields(data.fromTable);
        (data.joins || []).forEach((j) => {
          ensureFields(j.table);
          ensureFields(j.targetTable);
        });
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveProcFile() {
    if (!procSql) return;
    const name = procName || 'report';
    try {
      const res = await fetch(
        `/api/report_builder/procedure-files/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: procSql }),
        },
      );
      if (!res.ok) throw new Error('Save failed');
      const listRes = await fetch('/api/report_builder/procedure-files');
      const listData = await listRes.json();
      setProcFiles(listData.names || []);
      setSelectedProcFile(name);
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
        `/api/report_builder/procedure-files/${encodeURIComponent(selectedProcFile)}`,
      );
      const data = await res.json();
      setProcFileText(data.sql || '');
    } catch (err) {
      console.error(err);
    }
  }

  function handleParseSql() {
    setProcSql(procFileText);
  }

  if (!tables.length) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h2>Report Builder</h2>

      <section>
        <h3>Primary Table</h3>
        <select value={fromTable} onChange={(e) => setFromTable(e.target.value)}>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h3>Primary Table Filters</h3>
        {fromFilters.map((f, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
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
            <input
              type="number"
              value={f.open || 0}
              onChange={(e) => updateFromFilter(i, 'open', Number(e.target.value))}
              style={{ width: '3rem', marginRight: '0.25rem' }}
            />
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
              <option value="param">Param</option>
              <option value="value">Value</option>
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
            <input
              type="number"
              value={f.close || 0}
              onChange={(e) => updateFromFilter(i, 'close', Number(e.target.value))}
              style={{ width: '3rem', marginLeft: '0.25rem' }}
            />
            <button
              onClick={() => removeFromFilter(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addFromFilter}>Add Filter</button>
      </section>

      <section>
        <h3>Joins</h3>
        {joins.map((j, i) => {
          const targets = [fromTable, ...joins.slice(0, i).map((jn) => jn.table)];
          return (
            <div key={i} style={{ marginBottom: '0.5rem' }}>
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
              <span> with </span>
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
                  style={{ display: 'inline-block', marginLeft: '0.5rem' }}
                >
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
                Add Condition
              </button>
              {j.filters && j.filters.length > 0 && <span> | </span>}
              {j.filters?.map((f, k) => (
                <div key={k} style={{ marginTop: '0.25rem' }}>
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
                  <input
                    type="number"
                    value={f.open || 0}
                    onChange={(e) =>
                      updateJoinFilter(i, k, 'open', Number(e.target.value))
                    }
                    style={{ width: '3rem', marginRight: '0.25rem' }}
                  />
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
                    <option value="param">Param</option>
                    <option value="value">Value</option>
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
                  <input
                    type="number"
                    value={f.close || 0}
                    onChange={(e) =>
                      updateJoinFilter(i, k, 'close', Number(e.target.value))
                    }
                    style={{ width: '3rem', marginLeft: '0.25rem' }}
                  />
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
                Add Filter
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
        <button onClick={addJoin}>Add Join</button>
      </section>

      <section>
        <h3>Select Fields</h3>
        {fields.map((f, i) => (
          <div
            key={i}
            style={{ marginBottom: '0.5rem' }}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleFieldDrop(i)}
          >
            <select
              value={f.source}
              onChange={(e) => updateField(i, 'source', e.target.value)}
            >
              <option value="field">Field</option>
              <option value="alias">Alias</option>
            </select>
            {f.source === 'alias' ? (
              <select
                value={f.baseAlias}
                onChange={(e) => updateField(i, 'baseAlias', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              >
                {fields.slice(0, i).map((pf) =>
                  pf.alias ? (
                    <option key={pf.alias} value={pf.alias}>
                      {pf.alias}
                    </option>
                  ) : null,
                )}
              </select>
            ) : (
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
            )}
            <input
              placeholder="alias"
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
                  <option value="field">Field</option>
                  <option value="alias">Alias</option>
                </select>
                {p.source === 'alias' ? (
                  <select
                    value={p.alias}
                    onChange={(e) =>
                      updateCalcPart(i, k, 'alias', e.target.value)
                    }
                    style={{ marginLeft: '0.5rem' }}
                  >
                    {fields.slice(0, i).map((pf) =>
                      pf.alias ? (
                        <option key={pf.alias} value={pf.alias}>
                          {pf.alias}
                        </option>
                      ) : null,
                    )}
                  </select>
                ) : (
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
                )}
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
              Add Part
            </button>
            {f.source === 'field' && f.aggregate !== 'NONE' && (
              <div style={{ display: 'inline-block', marginLeft: '0.5rem' }}>
                {(f.conditions || []).map((c, k) => (
                  <div key={k} style={{ marginTop: '0.25rem' }}>
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
                      <option value="param">Param</option>
                      <option value="value">Value</option>
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
                    <button
                      onClick={() => removeFieldCondition(i, k)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button onClick={() => addFieldCondition(i)}>Add Condition</button>
              </div>
            )}
            <button
              onClick={() => removeField(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addField}>Add Field</button>
      </section>

      <section>
        <h3>Group By</h3>
        {groups.map((g, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
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
        <button onClick={addGroup}>Add Group</button>
      </section>

      <section>
        <h3>Having</h3>
        {having.map((h, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
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
            <input
              type="number"
              value={h.open || 0}
              onChange={(e) => updateHaving(i, 'open', Number(e.target.value))}
              style={{ width: '3rem', marginRight: '0.25rem' }}
            />
            <select
              value={h.source}
              onChange={(e) => updateHaving(i, 'source', e.target.value)}
            >
              <option value="field">Field</option>
              <option value="alias">Alias</option>
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
              <option value="param">Param</option>
              <option value="value">Value</option>
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
            <input
              type="number"
              value={h.close || 0}
              onChange={(e) => updateHaving(i, 'close', Number(e.target.value))}
              style={{ width: '3rem', marginLeft: '0.25rem' }}
            />
            <button
              onClick={() => removeHaving(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addHaving}>Add Having</button>
      </section>

      <section>
        <h3>Union Queries</h3>
        <div style={{ marginBottom: '0.5rem' }}>
          Added: {unionQueries.length}
        </div>
        <button onClick={addUnionQuery}>Add UNION</button>
      </section>

      <section>
        <h3>Parameters</h3>
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
            placeholder="name"
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
            Add
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
        <h3>Conditions</h3>
        {conditions.map((c, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
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
                <input
                  type="number"
                  value={c.open || 0}
                  onChange={(e) =>
                    updateCondition(i, 'open', Number(e.target.value))
                  }
                  style={{ width: '3rem', marginRight: '0.25rem' }}
                />
                <input
                  value={c.raw}
                  onChange={(e) => updateCondition(i, 'raw', e.target.value)}
                  style={{ width: '50%' }}
                />
                <input
                  type="number"
                  value={c.close || 0}
                  onChange={(e) =>
                    updateCondition(i, 'close', Number(e.target.value))
                  }
                  style={{ width: '3rem', marginLeft: '0.25rem' }}
                />
                <button
                  onClick={() => removeCondition(i)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                <input
                  type="number"
                  value={c.open || 0}
                  onChange={(e) =>
                    updateCondition(i, 'open', Number(e.target.value))
                  }
                  style={{ width: '3rem', marginRight: '0.25rem' }}
                />
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
                <input
                  type="number"
                  value={c.close || 0}
                  onChange={(e) =>
                    updateCondition(i, 'close', Number(e.target.value))
                  }
                  style={{ width: '3rem', marginLeft: '0.25rem' }}
                />
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
          Add Condition
        </button>
        <button onClick={addRawCondition} style={{ marginLeft: '0.5rem' }}>
          Add Raw Condition
        </button>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <label>
          Procedure Name:
          <div>
            report_
            <input
              value={procName}
              onChange={(e) => setProcName(e.target.value)}
              style={{ width: '50%' }}
            />
          </div>
        </label>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h3>Generate</h3>
        <button onClick={handleGenerateSql}>Create SQL</button>
        <button onClick={handleGenerateView} style={{ marginLeft: '0.5rem' }}>
          Create View
        </button>
        <button onClick={handleGenerateProc} style={{ marginLeft: '0.5rem' }}>
          Create Procedure
        </button>
      </section>

      {viewSql && (
        <section style={{ marginTop: '1rem' }}>
          <h3>View</h3>
          <button onClick={handlePostView}>POST View</button>
        </section>
      )}

      <section style={{ marginTop: '1rem' }}>
        <h3>Stored Procedure</h3>
        {procSql && <button onClick={handlePostProc}>POST Procedure</button>}
        <button onClick={handleSaveProcFile} style={{ marginLeft: '0.5rem' }}>
          Save to Host
        </button>
        <select
          value={selectedProcFile}
          onChange={(e) => setSelectedProcFile(e.target.value)}
          style={{ marginLeft: '0.5rem' }}
        >
          {procFiles.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button onClick={handleLoadProcFile} style={{ marginLeft: '0.5rem' }}>
          Load from Host
        </button>
      </section>

      {procFileText && (
        <section style={{ marginTop: '1rem' }}>
          <h3>Edit Loaded SQL</h3>
          <textarea
            value={procFileText}
            onChange={(e) => setProcFileText(e.target.value)}
            rows={8}
            style={{ width: '100%' }}
          />
          <button onClick={handleParseSql} style={{ marginTop: '0.5rem' }}>
            Parse SQL
          </button>
        </section>
      )}

      <section style={{ marginTop: '1rem' }}>
        <h3>Config</h3>
        <button onClick={handleSaveConfig}>Save Config</button>
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
        <button onClick={handleLoadConfig} style={{ marginLeft: '0.5rem' }}>
          Load Config
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
  );
}

