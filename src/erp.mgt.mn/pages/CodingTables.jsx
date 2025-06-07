import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function CodingTablesPage() {
  const [sheets, setSheets] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [headers, setHeaders] = useState([]);
  const [tableName, setTableName] = useState('');
  const [idColumn, setIdColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then((ab) => {
      const wb = XLSX.read(ab);
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      setSheet(wb.SheetNames[0]);
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
      });
      setHeaders(data[0] || []);
    });
  }

  function handleSheetChange(e) {
    const s = e.target.value;
    setSheet(s);
    if (workbook) {
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[s], { header: 1 });
      setHeaders(data[0] || []);
    }
  }

  async function handleUpload() {
    if (!workbook || !sheet || !tableName || !idColumn || !nameColumn) return;
    const ws = workbook.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json(ws);
    const formData = new FormData();
    const blob = new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })]);
    formData.append('file', blob, 'upload.xlsx');
    formData.append('sheet', sheet);
    formData.append('tableName', tableName);
    formData.append('idColumn', idColumn);
    formData.append('nameColumn', nameColumn);
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
  }

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
            Table Name:
            <input value={tableName} onChange={(e) => setTableName(e.target.value)} />
          </div>
          <div>
            ID Column:
            <select value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
              <option value="">--select--</option>
              {headers.map((h) => (
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
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleUpload}>Upload</button>
        </div>
      )}
    </div>
  );
}
