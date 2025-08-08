import React, { useEffect, useState, useRef } from 'react';
import buildStoredProcedure from '../utils/buildStoredProcedure.js';

const SESSION_PARAMS = [
  { name: 'session_branch_id', type: 'INT' },
  { name: 'session_user_id', type: 'VARCHAR(10)' },
  { name: 'session_company_id', type: 'INT' },
];

const PARAM_TYPES = ['INT', 'DATE', 'VARCHAR(50)', 'DECIMAL(10,2)'];
const AGGREGATES = ['NONE', 'SUM', 'COUNT', 'MAX', 'MIN'];
const OPERATORS = ['=', '>', '<', '>=', '<=', '<>'];

export default function ReportBuilder() {
  const [tables, setTables] = useState([]); // list of table names
  const [tableFields, setTableFields] = useState({}); // { tableName: [field, ...] }

  const [procName, setProcName] = useState('');
  const [fromTable, setFromTable] = useState('');
  const [joins, setJoins] = useState([]); // {table, alias, type, targetTable, conditions:[{fromField,toField,connector}]}
  const [fields, setFields] = useState([]); // {table, field, alias, aggregate}
  const [groups, setGroups] = useState([]); // {table, field}
  const [having, setHaving] = useState([]); // {aggregate, table, field, operator, valueType, value, param, connector}
  const [params, setParams] = useState([]); // {name,type,source}
  const [conditions, setConditions] = useState([]); // {table,field,param,connector}
  const [script, setScript] = useState('');
  const [error, setError] = useState('');

  const [customParamName, setCustomParamName] = useState('');
  const [customParamType, setCustomParamType] = useState(PARAM_TYPES[0]);
  const fileInput = useRef(null);

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
        type: 'INNER',
        targetTable,
        conditions: [
          {
            fromField: (tableFields[targetTable] || [])[0] || '',
            toField: (tableFields[table] || [])[0] || '',
            connector: 'AND',
          },
        ],
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
    if (!fromTable) return;
    setHaving([
      ...having,
      {
        aggregate: 'SUM',
        table: fromTable,
        field: (tableFields[fromTable] || [])[0] || '',
        operator: '=',
        valueType: params.length ? 'param' : 'value',
        param: params[0]?.name || '',
        value: '',
        connector: 'AND',
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

      const joinDefs = joins.map((j) => {
        const onInner = j.conditions
          .map(
            (c, idx) =>
              (idx > 0 ? ` ${c.connector} ` : '') +
              `${aliases[j.targetTable]}.${c.fromField} = ${aliases[j.table]}.${c.toField}`,
          )
          .join('');
        const on = j.conditions.length > 1 ? `(${onInner})` : onInner;
        return {
          table: j.table,
          alias: aliases[j.table],
          type: j.type,
          on,
        };
      });

      const where = conditions.map((c) => ({
        expr: `${aliases[c.table]}.${c.field} = :${c.param}`,
        connector: c.connector,
      }));

      const groupBy = groups.map((g) => `${aliases[g.table]}.${g.field}`);

      const havingDefs = having.map((h) => ({
        expr: `${h.aggregate}(${aliases[h.table]}.${h.field}) ${h.operator} ${
          h.valueType === 'param' ? `:${h.param}` : h.value
        }`,
        connector: h.connector,
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

  function handleSaveConfig() {
    const data = {
      procName,
      fromTable,
      joins,
      fields,
      groups,
      having,
      params,
      conditions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report_builder.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadClick() {
    fileInput.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text);
        setProcName(data.procName || '');
        setFromTable(data.fromTable || '');
        setJoins(
          (data.joins || []).map((j) => ({
            ...j,
            conditions: (j.conditions || []).map((c) => ({
              connector: c.connector || 'AND',
              ...c,
            })),
          })),
        );
        setFields(data.fields || []);
        setGroups(data.groups || []);
        setHaving(
          (data.having || []).map((h) => ({
            connector: h.connector || 'AND',
            valueType: h.valueType || (h.param ? 'param' : 'value'),
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
    });
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
        {joins.map((j, i) => {
          const targets = [fromTable, ...joins.slice(0, i).map((jn) => jn.table)];
          return (
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
            ) : (
              <input
                value={h.value}
                onChange={(e) => updateHaving(i, 'value', e.target.value)}
                style={{ marginLeft: '0.5rem' }}
              />
            )}
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
        <button onClick={handleSaveConfig} style={{ marginLeft: '0.5rem' }}>
          Save Config
        </button>
        <button onClick={handleLoadClick} style={{ marginLeft: '0.5rem' }}>
          Load Config
        </button>
        <input
          type="file"
          accept="application/json"
          ref={fileInput}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {script && (
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{script}</pre>
      )}
    </div>
  );
}

