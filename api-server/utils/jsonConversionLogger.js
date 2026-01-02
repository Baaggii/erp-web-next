import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const defaultLogFile = fileURLToPath(new URL('../logs/json_conversion.log', import.meta.url));
let resolvedLogFile = null;
let initialized = false;

function resolveLogPath() {
  if (resolvedLogFile) return resolvedLogFile;
  const customPath = process.env.JSON_CONVERSION_LOG_PATH;
  resolvedLogFile = customPath ? path.resolve(customPath) : defaultLogFile;
  return resolvedLogFile;
}

function ensureLogFile() {
  if (initialized) return;
  const logFile = resolveLogPath();
  try {
    fs.mkdirSync(dirname(logFile), { recursive: true });
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
    }
    initialized = true;
  } catch (err) {
    console.error('Failed to initialize JSON conversion log:', err);
  }
}

function truncate(value, maxLength = 800) {
  if (!value) return value;
  const str = String(value);
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…[truncated ${str.length - maxLength} chars]`;
}

function serializeError(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState || err.sqlstate,
      errno: err.errno,
      stack: truncate(err.stack, 1200),
      statement: truncate(err.statement),
      statementIndex: err.statementIndex,
    };
  }
  if (typeof err === 'object') {
    const copy = { ...err };
    if (copy.statement) copy.statement = truncate(copy.statement);
    if (copy.stack) copy.stack = truncate(copy.stack, 1200);
    return copy;
  }
  return err;
}

export function logConversionEvent(event = {}) {
  const logFile = resolveLogPath();
  const { error, statementsSample, failedStatement, ...rest } = event;
  const record = {
    timestamp: new Date().toISOString(),
    ...rest,
  };
  if (statementsSample) {
    record.statementsSample = statementsSample.map((stmt) => truncate(stmt));
  }
  if (failedStatement) {
    record.failedStatement = truncate(failedStatement);
  }
  if (error) {
    record.error = serializeError(error);
  }

  try {
    ensureLogFile();
    fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`);
  } catch (err) {
    console.error('Failed to write JSON conversion log:', err);
  }
}

export function getJsonConversionLogPath() {
  return resolveLogPath();
}
