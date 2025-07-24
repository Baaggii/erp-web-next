import callProcedure from './callProcedure.js';

/**
 * Fetch preview data by calling a stored procedure once.
 * @param {string} procName        Stored procedure name
 * @param {Array}  params          Procedure parameters
 * @param {Object} fieldMap        Map of returned fields -> preview field keys
 * @returns {Object}               Mapped preview values
 */
export default async function previewTransaction(procName, params = [], fieldMap = {}) {
  const row = await callProcedure(procName, params, Object.keys(fieldMap));
  const preview = {};
  Object.entries(fieldMap).forEach(([resultField, previewField]) => {
    if (row[resultField] !== undefined) {
      preview[previewField] = row[resultField];
    }
  });
  return preview;
}
