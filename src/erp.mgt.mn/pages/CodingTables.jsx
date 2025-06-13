import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';

export default function CodingTablesPage() {
  const [sheets, setSheets] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [headers, setHeaders] = useState([]);
  const [idCandidates, setIdCandidates] = useState([]);
  const [idFilterMode, setIdFilterMode] = useState('contains');
  const [headerRow, setHeaderRow] = useState(1);
  const [tableName, setTableName] = useState('');
  const [idColumn, setIdColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [otherColumns, setOtherColumns] = useState([]);
  const [uniqueFields, setUniqueFields] = useState([]);
  const [calcText, setCalcText] = useState('');
  const [sql, setSql] = useState('');
  const [uploading, setUploading] = useState(false);
  const [columnTypes, setColumnTypes] = useState({});
  const [notNullMap, setNotNullMap] = useState({});
  const [extraFields, setExtraFields] = useState(['', '', '']);
  const [populateRange, setPopulateRange] = useState(false);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');

  const allHeaders = useMemo(
    () => [...headers, ...extraFields.filter((f) => f.trim() !== '')],
    [headers, extraFields]
  );

  const hasDateField = useMemo(
    () => allHeaders.some((h) => /year|month|date/i.test(h)),
    [allHeaders]
  );

  function computeIdCandidates(hdrs, mode) {
    const strs = hdrs.filter((h) => typeof h === 'string');
    if (mode === 'contains') {
      const ids = strs.filter((h) => h.toLowerCase().includes('id'));
      return ids.length > 0 ? ids : strs;
    }
    return strs;
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then((ab) => {
      const wb = XLSX.read(ab);
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      const firstSheet = wb.SheetNames[0];
      setSheet(firstSheet);
      setHeaderRow(1);
      setHeaders([]);
      setIdCandidates([]);
      setIdColumn('');
      setNameColumn('');
      setSql('');
      setOtherColumns([]);
      setUniqueFields([]);
      setColumnTypes({});
      setNotNullMap({});
      setPopulateRange(false);
      setStartYear('');
      setEndYear('');
    });
  }

  function handleSheetChange(e) {
    const s = e.target.value;
    setSheet(s);
    setHeaders([]);
    setIdCandidates([]);
    setIdColumn('');
    setNameColumn('');
    setSql('');
    setOtherColumns([]);
    setUniqueFields([]);
    setColumnTypes({});
    setNotNullMap({});
    setPopulateRange(false);
    setStartYear('');
    setEndYear('');
  }

  function handleHeaderRowChange(e) {
    const r = Number(e.target.value) || 1;
    setHeaderRow(r);
    setHeaders([]);
    setIdCandidates([]);
    setIdColumn('');
    setNameColumn('');
    setSql('');
    setOtherColumns([]);
    setUniqueFields([]);
    setColumnTypes({});
    setNotNullMap({});
    setPopulateRange(false);
    setStartYear('');
    setEndYear('');
  }

  function extractHeaders(wb, s, row) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[s], {
      header: 1,
      blankrows: false,
    });
    const idx = Number(row) - 1;
    const raw = data[idx] || [];
    const hdrs = [];
    const keepIdx = [];
    raw.forEach((h, i) => {
      if (String(h).length > 1) {
        hdrs.push(h);
        keepIdx.push(i);
      }
    });
    setHeaders(hdrs);
    const rows = data.slice(idx + 1);
    const valsByHeader = {};
    hdrs.forEach((h, i) => {
      const colIdx = keepIdx[i];
      valsByHeader[h] = rows.map((r) => r[colIdx]);
    });
    const types = {};
    hdrs.forEach((h) => {
      types[h] = detectType(h, valsByHeader[h]);
    });
    setColumnTypes(types);
    const nn = {};
    hdrs.forEach((h) => {
      nn[h] = valsByHeader[h].every(
        (v) => v !== undefined && v !== null && v !== ''
      );
    });
    setNotNullMap(nn);
  }

  function handleExtract() {
    if (!workbook) return;
    extractHeaders(workbook, sheet, headerRow);
  }

  function escapeSqlValue(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  function detectType(name, vals) {
    const lower = String(name).toLowerCase();
    if (lower.includes('_per')) return 'DECIMAL(5,2)';
    if (lower.includes('date')) return 'DATE';
    for (const v of vals) {
      if (v === undefined || v === '') continue;
      const n = Number(v);
      if (!Number.isNaN(n)) {
        const str = String(v);
        const digits = str.replace(/[-.]/g, '');
        if (digits.length > 8) return 'VARCHAR(255)';
        if (str.includes('.')) return 'DECIMAL(10,2)';
        return 'INT';
      }
      break;
    }
    return 'VARCHAR(255)';
  }

  function parseExcelDate(val) {
    if (typeof val === 'number') {
      const base = new Date(Date.UTC(1899, 11, 30));
      base.setUTCDate(base.getUTCDate() + val);
      return base;
    }
    if (typeof val === 'string') {
      const m = val.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
      if (m) {
        const [, y, mo, d] = m;
        return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
      }
    }
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function parseCalcField(line) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:(.*)$/);
    if (!m) return null;
    const [, name, desc] = m;
    const lower = desc.trim().toLowerCase();
    if (lower.includes('age') && lower.includes('birth')) {
      return { name, expression: 'TIMESTAMPDIFF(YEAR, birthdate, CURDATE())' };
    }
    return { name, expression: desc.trim() };
  }

  function parseCalcFields(text) {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)
      .map(parseCalcField)
      .filter(Boolean);
  }

  function formatVal(val, type) {
    if (val === undefined || val === null || val === '') return 'NULL';
    if (type === 'DATE') {
      const d = parseExcelDate(val);
      if (!d) return 'NULL';
      return `'${d.toISOString().slice(0, 10)}'`;
    }
    if (type === 'INT' || type.startsWith('DECIMAL')) return String(val);
    return escapeSqlValue(val);
  }

  function defaultValForType(type) {
    if (!type) return 0;
    if (type === 'DATE') return 0;
    if (type === 'INT' || type.startsWith('DECIMAL')) return 0;
    return 0;
  }

  function makeUniqueKeyName(fields) {
    const base = `uniq_${fields.join('_')}`;
    if (base.length > 60) {
      let hash = 0;
      for (let i = 0; i < base.length; i++) {
        hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
      }
      return `uniq_${hash.toString(16)}`;
    }
    return base;
  }

  function handleGenerateSql() {
    if (!workbook || !sheet || !tableName) return;
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      blankrows: false,
    });
    const idx = Number(headerRow) - 1;
    const raw = data[idx] || [];
    const hdrs = [];
    const keepIdx = [];
    raw.forEach((h, i) => {
      if (String(h).length > 1) {
        hdrs.push(h);
        keepIdx.push(i);
      }
    });
    const extra = extraFields.filter((f) => f.trim() !== '');
    const rows = data
      .slice(idx + 1)
      .map((r) => [...keepIdx.map((ci) => r[ci]), ...Array(extra.length).fill(undefined)]);
    const allHdrs = [...hdrs, ...extra];

    const valuesByHeader = {};
    hdrs.forEach((h, i) => {
      valuesByHeader[h] = rows.map((r) => r[i]);
    });
    extra.forEach((h, idx2) => {
      valuesByHeader[h] = rows.map((r) => r[hdrs.length + idx2]);
    });
    const colTypes = {};
    const localNotNull = {};
    allHdrs.forEach((h) => {
      colTypes[h] = columnTypes[h] || detectType(h, valuesByHeader[h] || []);
      const defNN = (valuesByHeader[h] || []).every(
        (v) => v !== undefined && v !== null && v !== ''
      );
      localNotNull[h] =
        notNullMap[h] !== undefined ? notNullMap[h] : defNN;
    });

    const uniqueOnly = uniqueFields.filter(
      (c) => c !== idColumn && c !== nameColumn && !otherColumns.includes(c)
    );
    const otherFiltered = otherColumns.filter(
      (c) => c !== idColumn && c !== nameColumn && !uniqueOnly.includes(c)
    );
    if (!idColumn && !nameColumn && uniqueOnly.length === 0 && otherFiltered.length === 0) {
      alert('Please select at least one ID, Name, Unique or Other column');
      return;
    }
    const idIdx = allHdrs.indexOf(idColumn);
    const nameIdx = allHdrs.indexOf(nameColumn);
    const dbIdCol = idColumn ? 'id' : null;
    const dbNameCol = nameColumn ? 'name' : null;
    if (idColumn && idIdx === -1) return;
    if (nameColumn && nameIdx === -1) return;
    const uniqueIdx = uniqueOnly.map((c) => allHdrs.indexOf(c));
    const otherIdx = otherFiltered.map((c) => allHdrs.indexOf(c));

    let finalRows = rows;
    if (populateRange && startYear && endYear) {
      const yearField = allHdrs.find((h) => /year/i.test(h));
      if (yearField) {
        const monthField = allHdrs.find((h) => /month/i.test(h));
        const yIdx = allHdrs.indexOf(yearField);
        const mIdx = allHdrs.indexOf(monthField);
        finalRows = [];
        for (let y = Number(startYear); y <= Number(endYear); y++) {
          const months = monthField ? Array.from({ length: 12 }, (_, i) => i + 1) : [null];
          for (const mo of months) {
            for (const r of rows) {
              const copy = [...r];
              if (yIdx !== -1) copy[yIdx] = y;
              if (mIdx !== -1 && mo !== null) copy[mIdx] = mo;
              finalRows.push(copy);
            }
          }
        }
      }
    }
    if (populateRange) {
      finalRows = finalRows.filter(
        (r) => !r.some((v) => v === 0 || v === null)
      );
    }

    let defs = [];
    if (idColumn) {
      defs.push(`\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nameColumn) {
      defs.push(`\`${dbNameCol}\` ${colTypes[nameColumn]} NOT NULL`);
    }
    uniqueOnly.forEach((c) => {
      defs.push(`\`${c}\` ${colTypes[c]} NOT NULL`);
    });
    otherFiltered.forEach((c) => {
      let def = `\`${c}\` ${colTypes[c]}`;
      if (localNotNull[c]) def += ' NOT NULL';
      defs.push(def);
      });
    const calcFields = parseCalcFields(calcText);
    calcFields.forEach((cf) => {
      defs.push(`\`${cf.name}\` INT AS (${cf.expression}) STORED`);
    });
    const uniqueKeyFields = [
      ...(uniqueFields.includes(nameColumn) ? [dbNameCol] : []),
      ...uniqueOnly,
    ];
    if (uniqueKeyFields.length > 0) {
      const indexName = makeUniqueKeyName(uniqueKeyFields);
      defs.push(
        `UNIQUE KEY ${indexName} (${uniqueKeyFields
          .map((f) => `\`${f}\``)
          .join(', ')})`
      );
    }
    let sqlStr = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${defs.join(',\n  ')}\n);\n`;

    for (const r of finalRows) {
      const cols = [];
      const vals = [];
      let hasData = false;
      if (nameColumn) {
        const nameVal = r[nameIdx];
        if (nameVal === undefined || nameVal === null || nameVal === '') continue;
        cols.push(`\`${dbNameCol}\``);
        vals.push(formatVal(nameVal, colTypes[nameColumn]));
        hasData = true;
      }
      uniqueOnly.forEach((c, idx2) => {
        const ui = uniqueIdx[idx2];
        let v = ui === -1 ? defaultValForType(colTypes[c]) : r[ui];
        if (v === undefined || v === null || v === '') {
          v = defaultValForType(colTypes[c]);
        }
        cols.push(`\`${c}\``);
        vals.push(formatVal(v, colTypes[c]));
        hasData = true;
      });
      otherFiltered.forEach((c, idx2) => {
          const ci = otherIdx[idx2];
          let v = ci === -1 ? undefined : r[ci];
          if ((v === undefined || v === null || v === '') && localNotNull[c]) {
            v = defaultValForType(colTypes[c]);
          }
          if (v !== undefined && v !== null && v !== '') hasData = true;
          cols.push(`\`${c}\``);
          vals.push(formatVal(v, colTypes[c]));
        });
      if (!hasData) continue;
      if (populateRange && vals.some((v) => v === '0' || v === 'NULL')) continue;
      const updates = cols.map((c) => `${c} = VALUES(${c})`);
      sqlStr += `INSERT INTO \`${tableName}\` (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ')};\n`;
    }
    setSql(sqlStr);
  }

  async function handleUpload() {
    if (!workbook || !sheet || !tableName) return;
    const uniqueOnly = uniqueFields.filter(
      (c) => c !== idColumn && c !== nameColumn && !otherColumns.includes(c)
    );
    const otherFiltered = otherColumns.filter(
      (c) => c !== idColumn && c !== nameColumn && !uniqueOnly.includes(c)
    );
    if (!idColumn && !nameColumn && uniqueOnly.length === 0 && otherFiltered.length === 0) {
      alert('Please select at least one ID, Name, Unique or Other column');
      return;
    }
    setSql('');
    setUploading(true);
    try {
      const formData = new FormData();
      const blob = new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })]);
      formData.append('file', blob, 'upload.xlsx');
      formData.append('sheet', sheet);
      formData.append('headerRow', headerRow);
      formData.append('tableName', tableName);
      formData.append('idColumn', idColumn);
      formData.append('nameColumn', nameColumn);
      formData.append('otherColumns', JSON.stringify(otherColumns));
      formData.append('uniqueFields', JSON.stringify(uniqueFields));
      formData.append('calcFields', JSON.stringify(parseCalcFields(calcText)));
      formData.append('columnTypes', JSON.stringify(columnTypes));
      formData.append('notNullMap', JSON.stringify(notNullMap));
      formData.append('populateRange', String(populateRange));
      formData.append('startYear', startYear);
      formData.append('endYear', endYear);
      const res = await fetch('/api/coding_tables/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        alert('Upload failed');
        return;
      }
      const json = await res.json();
      alert(`Inserted ${json.inserted} rows`);
      setSql('');
    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    setIdCandidates(computeIdCandidates(allHeaders, idFilterMode));
    setUniqueFields((u) => u.filter((f) => allHeaders.includes(f)));
    setOtherColumns((o) => o.filter((f) => allHeaders.includes(f)));
    setNotNullMap((m) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = m[h] || false;
      });
      return updated;
    });
    if (idColumn && !allHeaders.includes(idColumn)) setIdColumn('');
    if (nameColumn && !allHeaders.includes(nameColumn)) setNameColumn('');
  }, [allHeaders, idFilterMode]);

  return (
    <div>
      <h2>Coding Table Upload</h2>
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
      {sheets.length > 0 && (
        <div>
          <div>
            Sheet:
            <select value={sheet} onChange={handleSheetChange}>
              {sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            Field Name Row:
            <input
              type="number"
              min="1"
              value={headerRow}
              onChange={handleHeaderRowChange}
            />
            <button onClick={handleExtract}>Read Columns</button>
          </div>
          <div>
            <label style={{ marginRight: '1rem' }}>
              <input
                type="radio"
                name="idFilterMode"
                value="contains"
                checked={idFilterMode === 'contains'}
                onChange={(e) => setIdFilterMode(e.target.value)}
              />
              id column should have "id" text
            </label>
            <label>
              <input
                type="radio"
                name="idFilterMode"
                value="all"
                checked={idFilterMode === 'all'}
                onChange={(e) => setIdFilterMode(e.target.value)}
              />
              pull all columns
            </label>
          </div>
          {allHeaders.length > 0 && (
            <>
              <div>
                Table Name:
                <input value={tableName} onChange={(e) => setTableName(e.target.value)} />
              </div>
              <div>
                Additional Fields:
                <div>
                  {extraFields.map((f, idx) => (
                    <input
                      key={idx}
                      value={f}
                      placeholder={`Field ${idx + 1}`}
                      onChange={(e) => {
                        const vals = [...extraFields];
                        vals[idx] = e.target.value;
                        setExtraFields(vals);
                      }}
                      style={{ marginRight: '0.5rem' }}
                    />
                  ))}
                </div>
              </div>
              {hasDateField && (
                <div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ marginRight: '0.5rem' }}>
                      <input
                        type="radio"
                        name="populateRange"
                        value="no"
                        checked={!populateRange}
                        onChange={() => setPopulateRange(false)}
                      />
                      No Range
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="populateRange"
                        value="yes"
                        checked={populateRange}
                        onChange={() => setPopulateRange(true)}
                      />
                      Populate Range
                    </label>
                  </div>
                  {populateRange && (
                    <div style={{ marginTop: '0.5rem' }}>
                      Start Year:{' '}
                      <input
                        type="number"
                        value={startYear}
                        onChange={(e) => setStartYear(e.target.value)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      End Year:{' '}
                      <input
                        type="number"
                        value={endYear}
                        onChange={(e) => setEndYear(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                ID Column:
                <select value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                  <option value="">--none--</option>
                  {idCandidates.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Name Column:
                <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
                  <option value="">--select--</option>
                  {allHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Unique Fields:
                <div>
                  {allHeaders.map((h) => (
                    <label key={h} style={{ marginRight: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={uniqueFields.includes(h)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUniqueFields([...uniqueFields, h]);
                            setOtherColumns(otherColumns.filter((c) => c !== h));
                          } else {
                            setUniqueFields(uniqueFields.filter((c) => c !== h));
                          }
                        }}
                      />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Other Columns:
                <div>
                  {allHeaders.map((h) => (
                    <label key={h} style={{ marginRight: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={otherColumns.includes(h)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setOtherColumns([...otherColumns, h]);
                            setUniqueFields(uniqueFields.filter((c) => c !== h));
                          } else {
                            setOtherColumns(otherColumns.filter((c) => c !== h));
                          }
                        }}
                      />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Column Types:
                <div>
                  {allHeaders.map((h) => (
                    <div key={h} style={{ marginBottom: '0.25rem' }}>
                      {h}:{' '}
                      <input
                        value={columnTypes[h] || ''}
                        onChange={(e) =>
                          setColumnTypes({
                            ...columnTypes,
                            [h]: e.target.value,
                          })
                        }
                      />
                      <label style={{ marginLeft: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={!notNullMap[h]}
                          onChange={(e) =>
                            setNotNullMap({
                              ...notNullMap,
                              [h]: !e.target.checked,
                            })
                          }
                        />
                        Allow Null
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                Calculated Fields (name: description):
                <textarea
                  rows={3}
                  cols={40}
                  value={calcText}
                  onChange={(e) => setCalcText(e.target.value)}
                />
              </div>
            <div>
              <button onClick={handleGenerateSql}>Populate SQL</button>
              <button onClick={handleUpload}>Create Coding Table</button>
            </div>
              {sql && (
                <div>
                  <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={10} cols={80} />
                </div>
              )}
              {uploading && (
                <div style={{ marginTop: '1rem' }}>
                  <progress /> Creating table...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
