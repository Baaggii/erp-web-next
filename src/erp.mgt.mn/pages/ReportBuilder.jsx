import React, { useEffect, useState } from 'react';
import buildStoredProcedure from '../utils/buildStoredProcedure.js';

const SESSION_PARAMS = [
  { name: 'session_branch_id', type: 'INT' },
  { name: 'session_user_id', type: 'VARCHAR(10)' },
  { name: 'session_company_id', type: 'INT' },
];

const PARAM_TYPES = ['INT', 'DATE', 'VARCHAR(50)', 'DECIMAL(10,2)'];
const AGGREGATES = ['NONE', 'SUM', 'COUNT', 'MAX', 'MIN'];

export default function ReportBuilder() {
  const [tables, setTables] = useState([]); // list of table names
  const [tableFields, setTableFields] = useState({}); // { tableName: [field, ...] }

  const [procName, setProcName] = useState('');
  const [fromTable, setFromTable] = useState('');
  const [joins, setJoins] = useState([]); // {table, alias, type, primaryField, joinField}
  const [fields, setFields] = useState([]); // {table, field, alias, aggregate}
  const [groups, setGroups] = useState([]); // {table, field}
  const [having, setHaving] = useState([]); // {aggregate, table, field, param}
  const [params, setParams] = useState([]); // {name,type,source}
  const [conditions, setConditions] = useState([]); // {table,field,param}
  const [script, setScript] = useState('');
  const [error, setError] = useState('');

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
  }, []);

  // Ensure fields for a table are loaded
  async function ensureFields(table) {
    if (!table || tableFields[table]) return;
    try {
      const res = await fetch(
        `/api/report_builder/fields?table=${encodeURIComponent(table)}`,
      );
      const data = await res.json();
      setTableFields((prev) => ({ ...prev, [table]: data.fields || [] }));
    } catch (err) {
      console.error(err);
    }
  }

  // load fields when primary table changes
  useEffect(() => {
    ensureFields(fromTable);
  }, [fromTable]);

  const availableTables = [fromTable, ...joins.map((j) => j.table)].filter(Boolean);

  function addJoin() {
    const remaining = tables.filter(
      (t) => t !== fromTable && !joins.some((j) => j.table === t),
    );
    const table = remaining[0] || tables[0];
    if (!table) return;
    ensureFields(table);
    const alias = `t${joins.length + 1}`;
    setJoins([
      ...joins,
      {
        table,
        alias,
        type: 'INNER',
        primaryField: (tableFields[fromTable] || [])[0] || '',
        joinField: (tableFields[table] || [])[0] || '',
      },
    ]);
  }

  function updateJoin(index, key, value) {
    const updated = joins.map((j, i) => (i === index ? { ...j, [key]: value } : j));
    setJoins(updated);
    if (key === 'table') ensureFields(value);
  }

  function removeJoin(index) {
    setJoins(joins.filter((_, i) => i !== index));
  }

  function addField() {
    if (!fromTable) return;
    setFields([
      ...fields,
      {
        table: fromTable,
        field: (tableFields[fromTable] || [])[0] || '',
        alias: '',
        aggregate: 'NONE',
      },
    ]);
  }

  function updateField(index, key, value) {
    const updated = fields.map((f, i) => (i === index ? { ...f, [key]: value } : f));
    setFields(updated);
    if (key === 'table') ensureFields(value);
  }

  function removeField(index) {
    setFields(fields.filter((_, i) => i !== index));
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
    if (!params.length || !fromTable) return;
    setHaving([
      ...having,
      {
        aggregate: 'SUM',
        table: fromTable,
        field: (tableFields[fromTable] || [])[0] || '',
        param: params[0].name,
      },
    ]);
  }

  function updateHaving(index, key, value) {
    const updated = having.map((h, i) => (i === index ? { ...h, [key]: value } : h));
    setHaving(updated);
    if (key === 'table') ensureFields(value);
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
      },
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

  function buildAliases() {
    const map = {};
    if (fromTable) map[fromTable] = 't0';
    joins.forEach((j, i) => {
      map[j.table] = j.alias || `t${i + 1}`;
    });
    return map;
  }

  function handleGenerate() {
    try {
      const aliases = buildAliases();

      const select = fields.map((f) => ({
        expr:
          f.aggregate && f.aggregate !== 'NONE'
            ? `${f.aggregate}(${aliases[f.table]}.${f.field})`
            : `${aliases[f.table]}.${f.field}`,
        alias: f.alias || undefined,
      }));

      const joinDefs = joins.map((j) => ({
        table: j.table,
        alias: aliases[j.table],
        type: j.type,
        on: `${aliases[fromTable]}.${j.primaryField} = ${aliases[j.table]}.${j.joinField}`,
      }));

      const where = conditions.map((c) => ({
        expr: `${aliases[c.table]}.${c.field} = :${c.param}`,
      }));

      const groupBy = groups.map((g) => `${aliases[g.table]}.${g.field}`);

      const havingDefs = having.map((h) => ({
        expr: `${h.aggregate}(${aliases[h.table]}.${h.field}) = :${h.param}`,
      }));

      const report = {
        from: { table: fromTable, alias: aliases[fromTable] },
        joins: joinDefs,
        select,
        where,
        groupBy,
        having: havingDefs,
      };

      const built = buildStoredProcedure({
        name: procName || 'report',
        params: params.map(({ name, type }) => ({ name, type })),
        report,
      });

      setScript(built);
      setError('');
    } catch (err) {
      setScript('');
      setError(err.message);
    }
  }

  async function handleSave() {
    if (!script) return;
    try {
      const name = `report_${procName || 'report'}`;
      const res = await fetch('/api/report-builder/procedures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sql: script }),
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
        <h3>Joins</h3>
        {joins.map((j, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <select
              value={j.type}
              onChange={(e) => updateJoin(i, 'type', e.target.value)}
            >
              <option value="INNER">INNER</option>
              <option value="LEFT">LEFT</option>
            </select>
            <select
              value={j.table}
              onChange={(e) => updateJoin(i, 'table', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            >
              {tables
                .filter((t) => t !== fromTable)
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
            <span> on </span>
            <select
              value={j.primaryField}
              onChange={(e) => updateJoin(i, 'primaryField', e.target.value)}
            >
              {(tableFields[fromTable] || []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <span> = </span>
            <select
              value={j.joinField}
              onChange={(e) => updateJoin(i, 'joinField', e.target.value)}
            >
              {(tableFields[j.table] || []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeJoin(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addJoin}>Add Join</button>
      </section>

      <section>
        <h3>Select Fields</h3>
        {fields.map((f, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <select
              value={f.table}
              onChange={(e) => updateField(i, 'table', e.target.value)}
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
            <input
              placeholder="alias"
              value={f.alias}
              onChange={(e) => updateField(i, 'alias', e.target.value)}
              style={{ marginLeft: '0.5rem' }}
            />
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
            <select
              value={h.aggregate}
              onChange={(e) => updateHaving(i, 'aggregate', e.target.value)}
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
            <button
              onClick={() => removeHaving(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addHaving} disabled={!params.length}>
          Add Having
        </button>
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
            <button
              onClick={() => removeCondition(i)}
              style={{ marginLeft: '0.5rem' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addCondition} disabled={!params.length}>
          Add Condition
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

      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleGenerate}>Generate Procedure</button>
        <button onClick={handleSave} style={{ marginLeft: '0.5rem' }}>
          Save Procedure
        </button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {script && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{script}</pre>
      )}
    </div>
  );
}

