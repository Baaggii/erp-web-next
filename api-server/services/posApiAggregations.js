function coerceNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function tokenizePath(path) {
  if (typeof path !== 'string' || !path.trim()) return [];
  return path
    .split('.')
    .map((segment) => {
      const trimmed = segment.trim();
      if (!trimmed) return null;
      const isArray = trimmed.endsWith('[]');
      return { key: isArray ? trimmed.slice(0, -2) : trimmed, isArray };
    })
    .filter(Boolean);
}

function extractValuesAtPath(source, path) {
  if (path === undefined || path === null) return [];
  const tokens = Array.isArray(path) ? path : tokenizePath(String(path));
  if (!tokens.length) return [];
  let current = [source];
  tokens.forEach((token) => {
    if (!token?.key) return;
    const next = [];
    current.forEach((entry) => {
      if (entry === undefined || entry === null) return;
      if (typeof entry !== 'object') return;
      const value = entry[token.key];
      if (token.isArray) {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item !== undefined) next.push(item);
          });
          return;
        }
        if (value !== undefined && value !== null) {
          next.push(value);
        }
        return;
      }
      if (value !== undefined) next.push(value);
    });
    current = next;
  });
  return current
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .filter((entry) => entry !== undefined);
}

function setValueAtPath(target, path, value) {
  if (!target || typeof target !== 'object') return false;
  const tokens = tokenizePath(path);
  if (!tokens.length) return false;
  let cursor = target;
  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    if (!token?.key) return;
    if (isLast) {
      if (token.isArray) {
        cursor[token.key] = Array.isArray(cursor[token.key]) ? cursor[token.key] : [];
        if (!cursor[token.key].length) {
          cursor[token.key].push(value);
        } else {
          cursor[token.key][0] = value;
        }
      } else {
        cursor[token.key] = value;
      }
      return;
    }
    if (cursor[token.key] === undefined || cursor[token.key] === null) {
      cursor[token.key] = token.isArray ? [{}] : {};
    }
    if (token.isArray) {
      cursor[token.key] = Array.isArray(cursor[token.key]) ? cursor[token.key] : [{}];
      if (!cursor[token.key].length) cursor[token.key].push({});
      cursor = cursor[token.key][0];
    } else if (typeof cursor[token.key] === 'object') {
      cursor = cursor[token.key];
    } else {
      const next = {};
      cursor[token.key] = next;
      cursor = next;
    }
  });
  return true;
}

const EXPRESSION_TOKEN_REGEX = /\s*(\d*\.\d+|\d+|[A-Za-z_][A-Za-z0-9_]*(?:\[\])?(?:\.[A-Za-z0-9_]+(?:\[\])?)*)|([()+\-*/])\s*/g;

function tokenizeExpression(expression = '') {
  const tokens = [];
  let match;
  while ((match = EXPRESSION_TOKEN_REGEX.exec(expression))) {
    const [_, identifier, operator] = match;
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier });
    } else if (operator) {
      tokens.push({ type: 'operator', value: operator });
    }
  }
  return tokens;
}

const OP_PRECEDENCE = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

const AGGREGATION_FUNCTIONS = new Set(['sum', 'count', 'min', 'max', 'avg']);

function toRpn(tokens = []) {
  const output = [];
  const operators = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'identifier') {
      const next = tokens[i + 1];
      if (next && next.type === 'operator' && next.value === '(' && AGGREGATION_FUNCTIONS.has(token.value)) {
        operators.push({ ...token, type: 'function' });
        continue;
      }
      output.push(token);
      continue;
    }
    if (token.type === 'operator') {
      if (token.value === '(') {
        operators.push(token);
        continue;
      }
      if (token.value === ')') {
        while (operators.length) {
          const op = operators.pop();
          if (op.value === '(') break;
          output.push(op);
        }
        const fn = operators[operators.length - 1];
        if (fn && fn.type === 'function') {
          output.push(operators.pop());
        }
        continue;
      }

      while (operators.length) {
        const top = operators[operators.length - 1];
        if (top.type === 'function') {
          output.push(operators.pop());
          continue;
        }
        const topPrecedence = OP_PRECEDENCE[top.value] ?? 0;
        const currentPrecedence = OP_PRECEDENCE[token.value] ?? 0;
        if (topPrecedence >= currentPrecedence) {
          output.push(operators.pop());
        } else {
          break;
        }
      }
      operators.push(token);
    }
  }

  while (operators.length) {
    output.push(operators.pop());
  }

  return output;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

function applyBinaryOp(left, right, op) {
  const leftArr = normalizeArray(left);
  const rightArr = normalizeArray(right);
  const len = Math.max(leftArr.length, rightArr.length);
  const result = [];
  for (let i = 0; i < len; i += 1) {
    const a = leftArr[Math.min(i, leftArr.length - 1)];
    const b = rightArr[Math.min(i, rightArr.length - 1)];
    const numA = coerceNumber(a);
    const numB = coerceNumber(b);
    const safeA = numA === null ? 0 : numA;
    const safeB = numB === null ? 0 : numB;
    if (op === '+') result.push(safeA + safeB);
    else if (op === '-') result.push(safeA - safeB);
    else if (op === '*') result.push(safeA * safeB);
    else if (op === '/') result.push(safeB === 0 ? 0 : safeA / safeB);
  }
  return result.length === 1 ? result[0] : result;
}

function evaluateRpn(rpnTokens, data) {
  const stack = [];
  rpnTokens.forEach((token) => {
    if (token.type === 'identifier') {
      const values = extractValuesAtPath(data, token.value);
      stack.push(values.length === 1 ? values[0] : values);
      return;
    }
    if (token.type === 'function') {
      const arg = stack.pop();
      const arr = normalizeArray(arg)
        .map((entry) => coerceNumber(entry))
        .filter((entry) => entry !== null);
      if (token.value === 'sum') {
        stack.push(arr.reduce((sum, val) => sum + val, 0));
        return;
      }
      if (token.value === 'count') {
        stack.push(arr.length);
        return;
      }
      if (token.value === 'min') {
        stack.push(arr.length ? Math.min(...arr) : null);
        return;
      }
      if (token.value === 'max') {
        stack.push(arr.length ? Math.max(...arr) : null);
        return;
      }
      if (token.value === 'avg') {
        if (!arr.length) {
          stack.push(null);
          return;
        }
        const sum = arr.reduce((total, val) => total + val, 0);
        stack.push(sum / arr.length);
        return;
      }
      stack.push(arg);
      return;
    }
    if (token.type === 'operator') {
      const right = stack.pop();
      const left = stack.pop();
      stack.push(applyBinaryOp(left, right, token.value));
    }
  });
  return stack.pop();
}

export function evaluateAggregationExpression(expression, data) {
  if (!expression || typeof expression !== 'string') return null;
  const tokens = tokenizeExpression(expression);
  if (!tokens.length) return null;
  const rpn = toRpn(tokens);
  return evaluateRpn(rpn, data);
}

function extractFormulaParts(formula = '') {
  const assignmentMatch = formula.includes('=') ? formula.split('=') : null;
  const rhs = assignmentMatch ? assignmentMatch.slice(1).join('=') : formula;
  const trimmed = rhs.trim();
  const aggMatch = /^([a-zA-Z]+)\s*\((.*)\)$/.exec(trimmed);
  if (aggMatch && AGGREGATION_FUNCTIONS.has(aggMatch[1])) {
    return { aggregation: aggMatch[1], expression: aggMatch[2] };
  }
  return { aggregation: null, expression: trimmed };
}

function applyAggregation(aggregation, value) {
  const values = normalizeArray(value)
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .map((entry) => coerceNumber(entry))
    .filter((entry) => entry !== null);
  if (aggregation === 'sum') return values.reduce((sum, val) => sum + val, 0);
  if (aggregation === 'count') return values.length;
  if (aggregation === 'min') return values.length ? Math.min(...values) : null;
  if (aggregation === 'max') return values.length ? Math.max(...values) : null;
  if (aggregation === 'avg') {
    if (!values.length) return null;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  return value;
}

function matchesPhase(entry, phase = 'request') {
  const normalized = typeof entry?.applyTo === 'string' ? entry.applyTo.trim().toLowerCase() : '';
  if (!normalized || normalized === 'both') return true;
  if (normalized === 'request' && phase === 'request') return true;
  if (normalized === 'response' && phase === 'response') return true;
  return false;
}

function normalizeAggregations(list = []) {
  if (Array.isArray(list)) return list.filter((entry) => entry && (entry.field || entry.key) && entry.formula);
  if (list && typeof list === 'object') {
    return Object.entries(list)
      .map(([field, formula]) => ({ field, formula }))
      .filter((entry) => entry.field && entry.formula);
  }
  return [];
}

export function applyAggregations(target, aggregations = [], { phase = 'request' } = {}) {
  const normalized = normalizeAggregations(aggregations);
  if (!normalized.length) return target;
  const base =
    typeof structuredClone === 'function'
      ? structuredClone(target)
      : JSON.parse(JSON.stringify(target ?? {}));
  normalized.forEach((entry) => {
    if (!entry || !matchesPhase(entry, phase)) return;
    const fieldPath = typeof entry.field === 'string' && entry.field.trim() ? entry.field.trim() : entry.key;
    if (!fieldPath) return;
    const { aggregation, expression } = extractFormulaParts(entry.formula || entry.expression || '');
    if (!expression) return;
    const value = evaluateAggregationExpression(expression, base);
    const finalValue = aggregation ? applyAggregation(aggregation, value) : value;
    if (finalValue === undefined) return;
    setValueAtPath(base, fieldPath, finalValue);
  });
  return base;
}

export function normalizeDefaultValueEntry(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const hasValue = Object.prototype.hasOwnProperty.call(entry, 'value');
    return {
      value: hasValue ? entry.value : entry,
      useInTransaction: entry.useInTransaction !== false,
    };
  }
  return { value: entry, useInTransaction: true };
}

export function shouldUseDefaultValue(entry) {
  return normalizeDefaultValueEntry(entry).useInTransaction !== false;
}

export function extractDefaultValue(entry) {
  return normalizeDefaultValueEntry(entry).value;
}

export function buildDefaultValueEntry(value, useInTransaction = true) {
  const normalized = normalizeDefaultValueEntry({ value, useInTransaction });
  if (normalized.value === undefined) return undefined;
  if (normalized.useInTransaction === true) return { value: normalized.value };
  return normalized;
}

export function normalizeRequestMappingValue(source) {
  if (source === undefined || source === null) return null;
  if (typeof source === 'string' || typeof source === 'number' || typeof source === 'boolean') {
    const trimmed = `${source}`.trim();
    if (!trimmed) return null;
    return { type: 'column', column: trimmed };
  }
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const type = typeof source.type === 'string'
      ? source.type
      : source.envVar
        ? 'env'
        : source.sessionVar
          ? 'session'
          : source.expression
            ? 'expression'
            : source.value !== undefined
              ? 'literal'
              : 'column';
    const base = {
      type,
      table: typeof source.table === 'string' ? source.table.trim() : '',
      column: typeof source.column === 'string' ? source.column.trim() : '',
      value: source.value !== undefined ? source.value : undefined,
      envVar: typeof source.envVar === 'string' ? source.envVar.trim() : '',
      sessionVar: typeof source.sessionVar === 'string' ? source.sessionVar.trim() : '',
      expression: typeof source.expression === 'string' ? source.expression.trim() : '',
      aggregation: typeof source.aggregation === 'string' ? source.aggregation : undefined,
    };
    if (type === 'literal' && (base.value === undefined || base.value === null)) return null;
    if (type === 'env' && !base.envVar) return null;
    if (type === 'session' && !base.sessionVar) return null;
    if (type === 'expression' && !base.expression) return null;
    if (type === 'column' && !base.column && !base.table) return null;
    return base;
  }
  return null;
}
