const MYSQL_FUNCTIONS = {
  IFNULL: (a, b) => (a === null || a === undefined ? b ?? null : a),
  COALESCE: (...args) => {
    for (const arg of args) {
      if (arg !== null && arg !== undefined) return arg;
    }
    return null;
  },
  NULLIF: (a, b) => {
    if (a === null || a === undefined) return null;
    if (b === null || b === undefined) return a;
    return Object.is(compareEqualityValue(a, b), 1) ? null : a;
  },
  IF: (condition, whenTrue, whenFalse) => {
    const result = toMySqlBoolean(condition);
    if (result === null) return null;
    return result === 1 ? whenTrue : whenFalse;
  },
  ROUND: (value, precision = 0) => {
    const num = toNumeric(value);
    if (num === null) return null;
    const prec = toNumeric(precision) ?? 0;
    const factor = 10 ** Math.trunc(prec);
    if (!Number.isFinite(factor) || factor === 0) return Math.round(num);
    return Math.round(num * factor) / factor;
  },
  TRUNCATE: (value, precision = 0) => {
    const num = toNumeric(value);
    if (num === null) return null;
    const prec = Math.trunc(toNumeric(precision) ?? 0);
    const factor = 10 ** prec;
    if (!Number.isFinite(factor) || factor === 0) return Math.trunc(num);
    return Math.trunc(num * factor) / factor;
  },
  ABS: (value) => {
    const num = toNumeric(value);
    if (num === null) return null;
    return Math.abs(num);
  },
  CEIL: (value) => {
    const num = toNumeric(value);
    if (num === null) return null;
    return Math.ceil(num);
  },
  CEILING: (value) => {
    const num = toNumeric(value);
    if (num === null) return null;
    return Math.ceil(num);
  },
  FLOOR: (value) => {
    const num = toNumeric(value);
    if (num === null) return null;
    return Math.floor(num);
  },
  POW: (value, exponent) => {
    const base = toNumeric(value);
    const exp = toNumeric(exponent);
    if (base === null || exp === null) return null;
    return base ** exp;
  },
  POWER: (value, exponent) => MYSQL_FUNCTIONS.POW(value, exponent),
  GREATEST: (...args) => {
    let result = null;
    for (const arg of args) {
      if (arg === null || arg === undefined) return null;
      const num = toNumeric(arg);
      if (num === null) return null;
      if (result === null || num > result) result = num;
    }
    return result;
  },
  LEAST: (...args) => {
    let result = null;
    for (const arg of args) {
      if (arg === null || arg === undefined) return null;
      const num = toNumeric(arg);
      if (num === null) return null;
      if (result === null || num < result) result = num;
    }
    return result;
  },
};

function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}

function toNumeric(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 0;
    return value;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value !== null && 'value' in value)
    return toNumeric(value.value);
  const str = String(value).trim();
  if (str === '') return 0;
  const normalized = normalizeNumberInput(str.replace(/,/g, '.'));
  const num = Number(normalized);
  if (Number.isNaN(num)) return 0;
  return num;
}

function toMySqlBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value !== null && 'value' in value)
    return toMySqlBoolean(value.value);
  const num = toNumeric(value);
  if (num === null) return null;
  return num === 0 ? 0 : 1;
}

function compareEqualityValue(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return null;
  }
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNum = toNumeric(left);
    const rightNum = toNumeric(right);
    if (leftNum === null || rightNum === null) return null;
    return leftNum === rightNum ? 1 : 0;
  }
  return String(left) === String(right) ? 1 : 0;
}

function readStringLiteral(expr, startIdx) {
  let idx = startIdx + 1;
  let result = '';
  while (idx < expr.length) {
    const ch = expr[idx];
    if (ch === '\\') {
      if (idx + 1 < expr.length) {
        result += expr[idx + 1];
        idx += 2;
      } else {
        idx += 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      return { value: result, endIdx: idx + 1 };
    }
    result += ch;
    idx += 1;
  }
  return { value: result, endIdx: idx };
}

function tokenizeMySqlExpression(expr) {
  const tokens = [];
  let idx = 0;
  while (idx < expr.length) {
    const ch = expr[idx];
    if (/\s/.test(ch)) {
      idx += 1;
      continue;
    }
    if (ch === '`') {
      const end = expr.indexOf('`', idx + 1);
      if (end === -1) {
        tokens.push({ type: 'identifier', value: expr.slice(idx + 1) });
        break;
      }
      tokens.push({ type: 'identifier', value: expr.slice(idx + 1, end) });
      idx = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const { value, endIdx } = readStringLiteral(expr, idx);
      tokens.push({ type: 'string', value });
      idx = endIdx;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let end = idx + 1;
      while (end < expr.length && /[0-9.]/.test(expr[end])) end += 1;
      tokens.push({ type: 'number', value: expr.slice(idx, end) });
      idx = end;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let end = idx + 1;
      while (end < expr.length && /[A-Za-z0-9_.$]/.test(expr[end])) end += 1;
      tokens.push({ type: 'identifier', value: expr.slice(idx, end) });
      idx = end;
      continue;
    }
    const twoCharOps = ['>=', '<=', '<>', '!=', '||', '&&'];
    const two = expr.slice(idx, idx + 2);
    if (twoCharOps.includes(two)) {
      tokens.push({ type: 'operator', value: two });
      idx += 2;
      continue;
    }
    tokens.push({ type: 'operator', value: ch });
    idx += 1;
  }
  return tokens;
}

class MySqlExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.idx = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.idx + offset] || null;
  }

  consume() {
    const token = this.tokens[this.idx];
    this.idx += 1;
    return token;
  }

  parsePrimary() {
    const token = this.consume();
    if (!token) return null;
    if (token.type === 'number') {
      return { type: 'number', value: Number(token.value) };
    }
    if (token.type === 'string') {
      return { type: 'string', value: token.value };
    }
    if (token.type === 'identifier') {
      if (this.peek()?.value === '(') {
        this.consume();
        const args = [];
        while (this.peek() && this.peek().value !== ')') {
          args.push(this.parseExpression());
          if (this.peek()?.value === ',') this.consume();
        }
        if (this.peek()?.value === ')') this.consume();
        return { type: 'call', name: token.value, args };
      }
      return { type: 'identifier', name: token.value };
    }
    if (token.value === '(') {
      const expr = this.parseExpression();
      if (this.peek()?.value === ')') this.consume();
      return expr;
    }
    if (token.value === '-') {
      return { type: 'unary', op: '-', argument: this.parsePrimary() };
    }
    return null;
  }

  parseMultiplicative() {
    let left = this.parsePrimary();
    while (true) {
      const op = this.peek();
      if (!op || !['*', '/'].includes(op.value)) break;
      this.consume();
      const right = this.parsePrimary();
      left = { type: 'binary', op: op.value, left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      const op = this.peek();
      if (!op || !['+', '-'].includes(op.value)) break;
      this.consume();
      const right = this.parseMultiplicative();
      left = { type: 'binary', op: op.value, left, right };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (true) {
      const op = this.peek();
      if (!op || !['=', '!=', '<>', '>', '<', '>=', '<='].includes(op.value)) break;
      this.consume();
      const right = this.parseAdditive();
      left = { type: 'binary', op: op.value, left, right };
    }
    return left;
  }

  parseExpression() {
    return this.parseComparison();
  }

  parse() {
    return this.parseExpression();
  }
}

function evaluateMySqlAst(node, context) {
  if (!node) return null;
  switch (node.type) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'identifier':
      return context.getValue(node.name);
    case 'unary': {
      const value = evaluateMySqlAst(node.argument, context);
      if (value === null || value === undefined) return null;
      if (node.op === '-') return -toNumeric(value);
      return value;
    }
    case 'binary': {
      const left = evaluateMySqlAst(node.left, context);
      const right = evaluateMySqlAst(node.right, context);
      switch (node.op) {
        case '+':
          return toNumeric(left) + toNumeric(right);
        case '-':
          return toNumeric(left) - toNumeric(right);
        case '*':
          return toNumeric(left) * toNumeric(right);
        case '/': {
          const denom = toNumeric(right);
          if (denom === 0) return null;
          return toNumeric(left) / denom;
        }
        case '=':
          return compareEqualityValue(left, right) === 1 ? 1 : 0;
        case '!=':
        case '<>':
          return compareEqualityValue(left, right) === 1 ? 0 : 1;
        case '>':
          return toNumeric(left) > toNumeric(right) ? 1 : 0;
        case '<':
          return toNumeric(left) < toNumeric(right) ? 1 : 0;
        case '>=':
          return toNumeric(left) >= toNumeric(right) ? 1 : 0;
        case '<=':
          return toNumeric(left) <= toNumeric(right) ? 1 : 0;
        default:
          return null;
      }
    }
    case 'call': {
      const name = node.name.toUpperCase();
      const fn = MYSQL_FUNCTIONS[name];
      if (!fn) return null;
      const args = node.args.map((arg) => evaluateMySqlAst(arg, context));
      return fn(...args);
    }
    default:
      return null;
  }
}

export function createGeneratedColumnEvaluator(expression, columnCaseMap) {
  try {
    const tokens = tokenizeMySqlExpression(expression);
    const parser = new MySqlExpressionParser(tokens);
    const ast = parser.parse();
    return ({ row }) => {
      const context = {
        getValue(identifier) {
          if (!identifier && identifier !== 0) return null;
          const raw = String(identifier);
          const normalized = raw.replace(/`/g, '');
          const lower = normalized.toLowerCase();
          const mapped = columnCaseMap[lower] || normalized;
          const value = row?.[mapped] ?? row?.[normalized] ?? row?.[lower];
          if (value && typeof value === 'object' && 'value' in value) {
            return value.value;
          }
          return value ?? null;
        },
      };
      return evaluateMySqlAst(ast, context);
    };
  } catch (err) {
    console.warn('Failed to compile generated column expression', expression, err);
    return null;
  }
}

export default createGeneratedColumnEvaluator;

const arrayIndexPattern = /^(0|[1-9]\d*)$/;

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractArrayMetadata(value) {
  if (!value || typeof value !== 'object') return null;
  const metadata = {};
  let hasMetadata = false;
  Object.keys(value).forEach((key) => {
    if (key === 'rows' || key === 'meta') return;
    if (!arrayIndexPattern.test(key)) {
      metadata[key] = value[key];
      hasMetadata = true;
    }
  });
  return hasMetadata ? metadata : null;
}

function assignArrayMetadata(target, source) {
  if (!Array.isArray(target) || !source || typeof source !== 'object') {
    return target;
  }
  const metadata = extractArrayMetadata(source);
  if (metadata) Object.assign(target, metadata);
  return target;
}

function getColumnGenerationExpression(column) {
  if (!column || typeof column !== 'object') return '';
  return (
    column.generationExpression ??
    column.GENERATION_EXPRESSION ??
    column.generation_expression ??
    ''
  );
}

function getColumnName(column) {
  if (!column || typeof column !== 'object') return '';
  return column.name ?? column.COLUMN_NAME ?? '';
}

export function buildGeneratedColumnEvaluators(
  columnMetaMap = {},
  columnCaseMapByTable = {},
) {
  const result = {};
  Object.entries(columnMetaMap).forEach(([table, cols]) => {
    if (!Array.isArray(cols) || cols.length === 0) return;
    const caseMap = { ...columnCaseMapByTable[table] };
    cols.forEach((col) => {
      const name = getColumnName(col);
      if (name) {
        const lower = name.toLowerCase();
        if (!caseMap[lower]) caseMap[lower] = name;
      }
    });
    const evaluators = {};
    cols.forEach((col) => {
      const expr = getColumnGenerationExpression(col);
      const name = getColumnName(col);
      if (!name || typeof expr !== 'string' || !expr.trim()) return;
      const evaluator = createGeneratedColumnEvaluator(expr, caseMap);
      if (typeof evaluator === 'function') {
        evaluators[name] = evaluator;
      }
    });
    if (Object.keys(evaluators).length > 0) {
      result[table] = evaluators;
    }
  });
  return result;
}

function applyGeneratedColumnsToContainer(container, evaluators) {
  if (!container || typeof container !== 'object') return container;
  const entries = Object.entries(evaluators || {}).filter(
    ([, fn]) => typeof fn === 'function',
  );
  if (entries.length === 0) return container;

  if (Array.isArray(container)) {
    let changed = false;
    const updated = container.map((row) => {
      if (!isPlainRecord(row)) return row;
      let working = row;
      let rowChanged = false;
      entries.forEach(([field, evaluator]) => {
        let nextValue;
        try {
          nextValue = evaluator({ row: working });
        } catch (err) {
          console.warn('Generated column evaluation failed', field, err);
          nextValue = undefined;
        }
        if (nextValue === undefined) return;
        const prevValue = working[field];
        if (Object.is(prevValue, nextValue)) return;
        if (!rowChanged) {
          working = { ...working };
          rowChanged = true;
        }
        working[field] = nextValue;
      });
      if (rowChanged) changed = true;
      return working;
    });

    if (!changed) {
      return container;
    }

    return assignArrayMetadata(updated, container);
  }

  if (isPlainRecord(container)) {
    let working = container;
    let changed = false;
    entries.forEach(([field, evaluator]) => {
      let nextValue;
      try {
        nextValue = evaluator({ row: working });
      } catch (err) {
        console.warn('Generated column evaluation failed', field, err);
        nextValue = undefined;
      }
      if (nextValue === undefined) return;
      const prevValue = working[field];
      if (Object.is(prevValue, nextValue)) return;
      if (!changed) {
        working = { ...working };
        changed = true;
      }
      working[field] = nextValue;
    });
    return changed ? working : container;
  }

  return container;
}

export function applyGeneratedColumnEvaluators(values = {}, evaluatorsByTable = {}) {
  if (!values || typeof values !== 'object') return values;
  let next = values;
  Object.entries(evaluatorsByTable || {}).forEach(([table, evaluators]) => {
    if (!evaluators || Object.keys(evaluators).length === 0) return;
    const current = next?.[table];
    const updated = applyGeneratedColumnsToContainer(current, evaluators);
    if (updated !== current) {
      if (next === values) next = { ...values };
      next[table] = updated;
    }
  });
  return next;
}
