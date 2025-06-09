import React, { useState, useEffect } from 'react';
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
  const [sql, setSql] = useState('');
  const [uploading, setUploading] = useState(false);

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
  }

  function extractHeaders(wb, s, row) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 });
    const idx = Number(row) - 1;
    const hdrs = data[idx] || [];
    setHeaders(hdrs);
    setIdCandidates(computeIdCandidates(hdrs, idFilterMode));
  }

  function handleExtract() {
    if (!workbook) return;
    extractHeaders(workbook, sheet, headerRow);
  }

  function escapeSqlValue(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  function handleGenerateSql() {
    if (!workbook || !sheet || !tableName || !idColumn || !nameColumn) return;
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1 });
    const idx = Number(headerRow) - 1;
    const hdrs = data[idx] || [];
    const rows = data.slice(idx + 1);
    const idIdx = hdrs.indexOf(idColumn);
    const nameIdx = hdrs.indexOf(nameColumn);
    if (idIdx === -1 || nameIdx === -1) return;
    const otherIdx = otherColumns.map((c) => hdrs.indexOf(c));
    if (otherIdx.some((i) => i === -1)) return;

    let sqlStr = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  id VARCHAR(255) PRIMARY KEY,\n  name VARCHAR(255)`;
    otherColumns.forEach((c) => {
      sqlStr += `,\n  \`${c}\` VARCHAR(255)`;
    });
    sqlStr += '\n);\n';

    rows.forEach((r) => {
      const id = r[idIdx];
      const name = r[nameIdx];
      if (id === undefined || name === undefined) return;
      const values = [escapeSqlValue(id), escapeSqlValue(name)];
      const cols = ['id', 'name'];
      otherColumns.forEach((c, idx2) => {
        values.push(escapeSqlValue(r[otherIdx[idx2]]));
        cols.push(`\`${c}\``);
      });
      const updates = ['name = VALUES(name)'];
      otherColumns.forEach((c) => updates.push(`\`${c}\` = VALUES(\`${c}\`)`));
      sqlStr += `INSERT INTO \`${tableName}\` (${cols.join(", ")}) VALUES (${values.join(", ")}) ON DUPLICATE KEY UPDATE ${updates.join(", ")};\n`;
    });
    setSql(sqlStr);
  }

  async function handleUpload() {
    if (!workbook || !sheet || !tableName || !idColumn || !nameColumn) return;
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
    setIdCandidates(computeIdCandidates(headers, idFilterMode));
  }, [headers, idFilterMode]);

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
          {headers.length > 0 && (
            <>
              <div>
                Table Name:
                <input value={tableName} onChange={(e) => setTableName(e.target.value)} />
              </div>
              <div>
                ID Column:
                {idCandidates.map((h) => (
                  <label key={h} style={{ marginRight: '1rem' }}>
                    <input
                      type="radio"
                      name="idCol"
                      value={h}
                      checked={idColumn === h}
                      onChange={(e) => setIdColumn(e.target.value)}
                    />
                    {h}
                  </label>
                ))}
              </div>
              <div>
                Name Column:
                <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
                  <option value="">--select--</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Other Columns:
                <select multiple value={otherColumns} onChange={(e) =>
                    setOtherColumns(Array.from(e.target.selectedOptions, (o) => o.value))}>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button onClick={handleGenerateSql}>Populate SQL</button>
                <button onClick={handleUpload}>Create Coding Table</button>
              </div>
              {sql && (
                <div>
                  <textarea value={sql} readOnly rows={10} cols={80} />
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
