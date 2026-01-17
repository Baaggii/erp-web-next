import buildReportSql from './buildReportSql.js';

/**
 * Build a stored procedure SQL string from a procedure definition.
 * @param {Object} definition
 * @param {string} definition.name - Procedure name excluding any configured prefix
 * @param {Array<{name:string,type:string}>} [definition.params]
 * @param {Object} definition.report - Report definition passed to buildReportSql
 * @param {string} [definition.prefix] - Optional prefix inserted at the start of the procedure name
 * @returns {string}
 */
export default function buildStoredProcedure(definition = {}) {
  const {
    name,
    params = [],
    report,
    prefix = '',
    config,
    reportSqlOptions = {},
    preStatements = [],
  } = definition;
  if (!name) throw new Error('procedure name is required');
  if (!report) throw new Error('report definition is required');

  const procName = `${prefix}${name}`;
  const paramLines = params.map((p) => `IN ${p.name} ${p.type}`).join(',\n  ');
  let selectSql = buildReportSql(report, reportSqlOptions);
  params.forEach((p) => {
    const re = new RegExp(`:${p.name}\\b`, 'g');
    selectSql = selectSql.replace(re, p.name);
  });
  selectSql = selectSql
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');

  const preSql = preStatements
    .filter(Boolean)
    .map((statement) => {
      const trimmed = statement.trim().replace(/;+$/, '');
      const withSemicolon = trimmed ? `${trimmed};` : '';
      return withSemicolon
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');

  const configBlock = `  /*REPORT_BUILDER_CONFIG ${JSON.stringify(
    config || {},
  )}*/`;

  return [
    `DROP PROCEDURE IF EXISTS ${procName};`,
    'DELIMITER $$',
    `CREATE PROCEDURE ${procName}(`,
    paramLines ? `  ${paramLines}` : '',
    ')',
    'BEGIN',
    preSql,
    selectSql + ';',
    configBlock,
    'END $$',
    'DELIMITER ;',
  ]
    .filter(Boolean)
    .join('\n');
}
