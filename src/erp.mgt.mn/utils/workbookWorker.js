import * as XLSX from 'xlsx';

self.onmessage = (e) => {
  const { id, arrayBuffer } = e.data;
  let workbook = null;
  let error = null;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  } catch (err) {
    error = err.message || String(err);
  }
  self.postMessage({ id, workbook, error });
};
