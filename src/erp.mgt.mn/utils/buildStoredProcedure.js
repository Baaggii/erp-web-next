import buildReportSql from './buildReportSql.js';

/**
 * Build a stored procedure SQL string from a procedure definition.
 * @param {Object} definition
 * @param {string} definition.name - Procedure name without the "report_" prefix
 * @param {Array<{name:string,type:string}>} [definition.params]
 * @param {Object} definition.report - Report definition passed to buildReportSql
 * @param {string} [definition.suffix] - Optional suffix appended to the procedure name
 * @returns {string}
 */
export default function buildStoredProcedure(definition = {}) {
  const { name, params = [], report, suffix = '' } = definition;
  if (!name) throw new Error('procedure name is required');
  if (!report) throw new Error('report definition is required');

  const procName = `report_${name}${suffix}`;
  const paramLines = params.map((p) => `IN ${p.name} ${p.type}`).join(',\n  ');
  let selectSql = buildReportSql(report);
  params.forEach((p) => {
    const re = new RegExp(`:${p.name}\\b`, 'g');
    selectSql = selectSql.replace(re, p.name);
  });
  selectSql = selectSql
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');

  return [
    `DROP PROCEDURE IF EXISTS ${procName};`,
    'DELIMITER $$',
    `CREATE PROCEDURE ${procName}(`,
    paramLines ? `  ${paramLines}` : '',
    ')',
    'BEGIN',
    selectSql + ';',
    'END $$',
    'DELIMITER ;',
  ]
    .filter(Boolean)
    .join('\n');
}
