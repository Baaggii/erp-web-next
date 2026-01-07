function normalizeNumberInput(value) {
  if (typeof value !== 'string') return value;
  return value.replace(',', '.');
}


export function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!valuesEqual(a[key], b[key])) return false;
  }
  return true;
}

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
    if (ch === "'") {
      if (expr[idx + 1] === "'") {
        result += "'";
        idx += 2;
        continue;
      }
      return { value: result, nextIndex: idx + 1 };
    }
    result += ch;
    idx += 1;
  }
  throw new Error('Unterminated string literal');
}

function readQuotedIdentifier(expr, startIdx) {
  let idx = startIdx + 1;
  let result = '';
  while (idx < expr.length) {
    const ch = expr[idx];
    if (ch === '`') {
      if (expr[idx + 1] === '`') {
        result += '`';
        idx += 2;
        continue;
      }
      return { value: result, nextIndex: idx + 1 };
    }
    result += ch;
    idx += 1;
  }
  throw new Error('Unterminated quoted identifier');
}

function readNumberLiteral(expr, startIdx) {
  let idx = startIdx;
  let sawDot = false;
  let sawExp = false;
  while (idx < expr.length) {
    const ch = expr[idx];
    if (/[0-9]/.test(ch)) {
      idx += 1;
      continue;
    }
    if (ch === '.' && !sawDot && !sawExp) {
      sawDot = true;
      idx += 1;
      continue;
    }
    if ((ch === 'e' || ch === 'E') && !sawExp) {
      sawExp = true;
      idx += 1;
      if (expr[idx] === '+' || expr[idx] === '-') idx += 1;
      continue;
    }
    break;
  }
  const text = expr.slice(startIdx, idx);
  const value = Number(text);
  return { value: Number.isNaN(value) ? 0 : value, nextIndex: idx };
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
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      idx += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      idx += 1;
      continue;
    }
    if (ch === "'" ) {
      const { value, nextIndex } = readStringLiteral(expr, idx);
      tokens.push({ type: 'string', value });
      idx = nextIndex;
      continue;
    }
    if (ch === '`') {
      const { value, nextIndex } = readQuotedIdentifier(expr, idx);
      tokens.push({ type: 'identifier', value, upper: value.toUpperCase() });
      idx = nextIndex;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[idx + 1] || ''))) {
      const { value, nextIndex } = readNumberLiteral(expr, idx);
      tokens.push({ type: 'number', value });
      idx = nextIndex;
      continue;
    }
    if (ch === '!' && expr[idx + 1] === '=') {
      tokens.push({ type: 'operator', value: '!=' });
      idx += 2;
      continue;
    }
    if (ch === '<' || ch === '>') {
      let op = ch;
      if (expr[idx + 1] === '=') {
        op += '=';
        idx += 2;
      } else if (ch === '<' && expr[idx + 1] === '>') {
        op = '<>';
        idx += 2;
      } else {
        idx += 1;
      }
      tokens.push({ type: 'operator', value: op });
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'operator', value: '=' });
      idx += 1;
      continue;
    }
    if (ch === '&' && expr[idx + 1] === '&') {
      tokens.push({ type: 'operator', value: 'AND' });
      idx += 2;
      continue;
    }
    if (ch === '|' && expr[idx + 1] === '|') {
      tokens.push({ type: 'operator', value: 'OR' });
      idx += 2;
      continue;
    }
    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch });
      idx += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let end = idx + 1;
      while (end < expr.length && /[A-Za-z0-9_$]/.test(expr[end])) end += 1;
      const word = expr.slice(idx, end);
      if (expr[end] === "'" && word.startsWith('_')) {
        const { value, nextIndex } = readStringLiteral(expr, end);
        tokens.push({ type: 'string', value });
        idx = nextIndex;
        continue;
      }
      tokens.push({ type: 'identifier', value: word, upper: word.toUpperCase() });
      idx = end;
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
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

  consume() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  matchOperator(...ops) {
    const token = this.peek();
    if (!token || token.type !== 'operator') return false;
    if (!ops.some((op) => token.value.toUpperCase() === op.toUpperCase())) return false;
    this.index += 1;
    return token.value.toUpperCase();
  }

  matchKeyword(name) {
    const token = this.peek();
    if (!token || token.type !== 'identifier') return false;
    if (token.upper !== name.toUpperCase()) return false;
    this.index += 1;
    return true;
  }

  expectKeyword(name) {
    if (!this.matchKeyword(name)) throw new Error(`Expected keyword ${name}`);
  }

  expectOperator(op) {
    if (!this.matchOperator(op)) throw new Error(`Expected operator ${op}`);
  }

  parse() {
    const expr = this.parseExpression();
    if (this.index < this.tokens.length) {
      throw new Error('Unexpected tokens in expression');
    }
    return expr;
  }

  parseExpression() {
    return this.parseLogicalOr();
  }

  parseLogicalOr() {
    let expr = this.parseLogicalAnd();
    while (this.matchOperator('OR') || this.matchKeyword('OR')) {
      const right = this.parseLogicalAnd();
      expr = { type: 'binary', operator: 'OR', left: expr, right };
    }
    return expr;
  }

  parseLogicalAnd() {
    let expr = this.parseEquality();
    while (this.matchOperator('AND') || this.matchKeyword('AND')) {
      const right = this.parseEquality();
      expr = { type: 'binary', operator: 'AND', left: expr, right };
    }
    return expr;
  }

  parseEquality() {
    let expr = this.parseComparison();
    while (true) {
      let op = this.matchOperator('=', '!=', '<>', 'IS');
      if (!op && this.peek()?.type === 'identifier' && this.peek().upper === 'IS') {
        this.consume();
        op = 'IS';
      }
      if (!op) break;
      if (op === 'IS' || op === 'is') {
        const not = this.matchKeyword('NOT');
        if (this.matchKeyword('NULL')) {
          expr = { type: 'isNull', argument: expr, not: Boolean(not) };
          continue;
        }
        throw new Error('Unsupported IS expression');
      }
      const right = this.parseComparison();
      expr = { type: 'binary', operator: op, left: expr, right };
    }
    return expr;
  }

  parseComparison() {
    let expr = this.parseTerm();
    while (true) {
      const op = this.matchOperator('<', '>', '<=', '>=');
      if (!op) break;
      const right = this.parseTerm();
      expr = { type: 'binary', operator: op, left: expr, right };
    }
    return expr;
  }

  parseTerm() {
    let expr = this.parseFactor();
    while (true) {
      const token = this.matchOperator('+', '-', '||');
      if (!token) break;
      const right = this.parseFactor();
      const op = token === '||' ? 'OR' : token;
      expr = { type: 'binary', operator: op, left: expr, right };
    }
    return expr;
  }

  parseFactor() {
    let expr = this.parseUnary();
    while (true) {
      const token = this.matchOperator('*', '/', '%', 'DIV', 'MOD');
      if (!token) break;
      const right = this.parseUnary();
      expr = { type: 'binary', operator: token, left: expr, right };
    }
    return expr;
  }

  parseUnary() {
    if (this.matchOperator('+')) {
      const argument = this.parseUnary();
      return { type: 'unary', operator: '+', argument };
    }
    if (this.matchOperator('-')) {
      const argument = this.parseUnary();
      return { type: 'unary', operator: '-', argument };
    }
    if (this.matchKeyword('NOT') || this.matchOperator('NOT')) {
      const argument = this.parseUnary();
      return { type: 'unary', operator: 'NOT', argument };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of expression');
    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value };
    }
    if (token.type === 'identifier' && token.upper === 'NULL') {
      this.consume();
      return { type: 'null' };
    }
    if (token.type === 'identifier' && (token.upper === 'TRUE' || token.upper === 'FALSE')) {
      this.consume();
      return { type: 'boolean', value: token.upper === 'TRUE' };
    }
    if (token.type === 'paren' && token.value === '(') {
      this.consume();
      const expr = this.parseExpression();
      if (!this.matchOperator(')') && !(this.peek()?.type === 'paren' && this.peek().value === ')')) {
        throw new Error('Expected )');
      }
      if (this.peek()?.type === 'paren' && this.peek().value === ')') this.consume();
      return expr;
    }
    if (token.type === 'identifier' && token.upper === 'CASE') {
      return this.parseCaseExpression();
    }
    if (token.type === 'identifier') {
      this.consume();
      if ((this.peek()?.type === 'paren' && this.peek().value === '(') || this.matchOperator('(')) {
        if (!(this.peek()?.type === 'paren' && this.peek().value === '(')) {
          this.index -= 1;
          this.consume();
        }
        const args = [];
        if (this.matchOperator(')') || (this.peek()?.type === 'paren' && this.peek().value === ')')) {
          if (this.peek()?.type === 'paren' && this.peek().value === ')') this.consume();
          return { type: 'function', name: token.value, args };
        }
        while (true) {
          args.push(this.parseExpression());
          if (this.matchOperator(')') || (this.peek()?.type === 'paren' && this.peek().value === ')')) {
            if (this.peek()?.type === 'paren' && this.peek().value === ')') this.consume();
            break;
          }
          if (!this.matchOperator(',') && !(this.peek()?.type === 'comma')) {
            throw new Error('Expected , in function arguments');
          }
          if (this.peek()?.type === 'comma') this.consume();
        }
        return { type: 'function', name: token.value, args };
      }
      return { type: 'identifier', name: token.value };
    }
    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  parseCaseExpression() {
    this.expectKeyword('CASE');
    if (this.matchKeyword('WHEN')) {
      const branches = [];
      do {
        const condition = this.parseExpression();
        this.expectKeyword('THEN');
        const result = this.parseExpression();
        branches.push({ condition, result });
      } while (this.matchKeyword('WHEN'));
      let elseResult = null;
      if (this.matchKeyword('ELSE')) {
        elseResult = this.parseExpression();
      }
      this.expectKeyword('END');
      return { type: 'case', branches, elseResult };
    }
    const base = this.parseExpression();
    const branches = [];
    while (this.matchKeyword('WHEN')) {
      const whenValue = this.parseExpression();
      this.expectKeyword('THEN');
      const result = this.parseExpression();
      branches.push({ whenValue, result });
    }
    let elseResult = null;
    if (this.matchKeyword('ELSE')) {
      elseResult = this.parseExpression();
    }
    this.expectKeyword('END');
    return { type: 'caseSimple', base, branches, elseResult };
  }
}

function evaluateMySqlAst(node, context) {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'null':
      return null;
    case 'boolean':
      return node.value ? 1 : 0;
    case 'identifier': {
      return context.getValue(node.name);
    }
    case 'unary': {
      const value = evaluateMySqlAst(node.argument, context);
      if (node.operator === '-') {
        const num = toNumeric(value);
        return num === null ? null : -num;
      }
      if (node.operator === '+') {
        const num = toNumeric(value);
        return num === null ? null : num;
      }
      if (node.operator === 'NOT') {
        const bool = toMySqlBoolean(value);
        if (bool === null) return null;
        return bool === 1 ? 0 : 1;
      }
      return null;
    }
    case 'binary': {
      const left = evaluateMySqlAst(node.left, context);
      const right = evaluateMySqlAst(node.right, context);
      switch (node.operator) {
        case '+': {
          if (left === null || right === null) return null;
          return toNumeric(left) + toNumeric(right);
        }
        case '-': {
          if (left === null || right === null) return null;
          return toNumeric(left) - toNumeric(right);
        }
        case '*': {
          if (left === null || right === null) return null;
          return toNumeric(left) * toNumeric(right);
        }
        case '/': {
          if (left === null || right === null) return null;
          const denominator = toNumeric(right);
          if (denominator === 0) return null;
          return toNumeric(left) / denominator;
        }
        case '%':
        case 'MOD': {
          if (left === null || right === null) return null;
          const denom = toNumeric(right);
          if (denom === 0) return null;
          return toNumeric(left) % denom;
        }
        case 'DIV': {
          if (left === null || right === null) return null;
          const denom = toNumeric(right);
          if (denom === 0) return null;
          return Math.trunc(toNumeric(left) / denom);
        }
        case '=':
        case '!=':
        case '<>': {
          const eq = compareEqualityValue(left, right);
          if (eq === null) return null;
          if (node.operator === '=') return eq;
          return eq === 1 ? 0 : 1;
        }
        case '<': {
          if (left === null || right === null) return null;
          return toNumeric(left) < toNumeric(right) ? 1 : 0;
        }
        case '<=': {
          if (left === null || right === null) return null;
          return toNumeric(left) <= toNumeric(right) ? 1 : 0;
        }
        case '>': {
          if (left === null || right === null) return null;
          return toNumeric(left) > toNumeric(right) ? 1 : 0;
        }
        case '>=': {
          if (left === null || right === null) return null;
          return toNumeric(left) >= toNumeric(right) ? 1 : 0;
        }
        case 'AND': {
          const leftBool = toMySqlBoolean(left);
          const rightBool = toMySqlBoolean(right);
          if (leftBool === 0 || rightBool === 0) return 0;
          if (leftBool === null || rightBool === null) return null;
          return 1;
        }
        case 'OR': {
          const leftBool = toMySqlBoolean(left);
          const rightBool = toMySqlBoolean(right);
          if (leftBool === 1 || rightBool === 1) return 1;
          if (leftBool === null || rightBool === null) return null;
          return 0;
        }
        default:
          return null;
      }
    }
    case 'function': {
      const fn = MYSQL_FUNCTIONS[node.name.toUpperCase()];
      if (!fn) return null;
      const args = node.args.map((arg) => evaluateMySqlAst(arg, context));
      try {
        return fn(...args);
      } catch (err) {
        console.warn('Failed to evaluate function', node.name, err);
        return null;
      }
    }
    case 'case': {
      for (const branch of node.branches) {
        const cond = evaluateMySqlAst(branch.condition, context);
        if (toMySqlBoolean(cond) === 1) return evaluateMySqlAst(branch.result, context);
      }
      return node.elseResult ? evaluateMySqlAst(node.elseResult, context) : null;
    }
    case 'caseSimple': {
      const base = evaluateMySqlAst(node.base, context);
      for (const branch of node.branches) {
        const whenValue = evaluateMySqlAst(branch.whenValue, context);
        const eq = compareEqualityValue(base, whenValue);
        if (eq === 1) return evaluateMySqlAst(branch.result, context);
      }
      return node.elseResult ? evaluateMySqlAst(node.elseResult, context) : null;
    }
    case 'isNull': {
      const val = evaluateMySqlAst(node.argument, context);
      const isNull = val === null || val === undefined;
      return node.not ? (isNull ? 0 : 1) : isNull ? 1 : 0;
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


function toFieldSet(fields) {
  if (!fields) return null;
  if (fields instanceof Set) return fields;
  const set = new Set();
  if (typeof fields === 'string') {
    set.add(fields);
    return set;
  }
  if (typeof fields?.[Symbol.iterator] === 'function') {
    for (const field of fields) {
      if (typeof field === 'string' && field) set.add(field);
    }
  }
  return set.size > 0 ? set : null;
}

export function applyGeneratedColumnEvaluators({
  targetRows,
  evaluators,
  indices = null,
  mainFields = null,
  metadataFields = null,
  equals = valuesEqual,
  metadataTarget = null,
}) {
  const entries = Array.isArray(evaluators) ? evaluators : Object.entries(evaluators || {});
  const filtered = entries.filter(([, fn]) => typeof fn === 'function');
  if (!Array.isArray(targetRows) || filtered.length === 0) {
    return { changed: false, metadata: null };
  }
  const list =
    indices == null
      ? targetRows.map((_, idx) => idx)
      : Array.isArray(indices)
      ? indices
      : [indices];
  const mainSet = toFieldSet(mainFields);
  const metadataSet = toFieldSet(metadataFields);
  const treatAllAsMain = !mainSet || mainSet.size === 0;
  const metadataContainer = metadataTarget ?? targetRows;
  const metadataUpdates = {};
  let changed = false;
  const maxPasses = 5;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let passChanged = false;
    const passMetadata = {};

    list.forEach((idx) => {
      if (typeof idx !== 'number' || idx < 0 || idx >= targetRows.length) return;
      const original = targetRows[idx];
      if (!original || typeof original !== 'object') return;
      let working = original;
      let rowChanged = false;
      filtered.forEach(([col, evaluator]) => {
        let nextValue;
        try {
          nextValue = evaluator({ row: working });
        } catch (err) {
          console.warn('Failed to evaluate generated column', col, err);
          nextValue = undefined;
        }
        if (nextValue === undefined) return;
        if (treatAllAsMain || mainSet?.has(col)) {
          const prev = working[col];
          const equal = Object.is(prev, nextValue) || equals(prev, nextValue);
          if (!equal) {
            if (!rowChanged) {
              working = { ...working };
              rowChanged = true;
            }
            working[col] = nextValue;
            passChanged = true;
          }
        } else if (metadataSet?.has(col)) {
          const prevMeta =
            metadataContainer && typeof metadataContainer === 'object'
              ? metadataContainer[col]
              : undefined;
          const equal = Object.is(prevMeta, nextValue) || equals(prevMeta, nextValue);
          if (!equal) {
            passMetadata[col] = nextValue;
            passChanged = true;
          }
        }
      });
      if (rowChanged) {
        targetRows[idx] = working;
      }
    });

    if (Object.keys(passMetadata).length > 0) {
      Object.assign(metadataUpdates, passMetadata);
    }
    changed = changed || passChanged || Object.keys(passMetadata).length > 0;
    if (!passChanged && Object.keys(passMetadata).length === 0) {
      break;
    }
  }

  return {
    changed,
    metadata: Object.keys(metadataUpdates).length > 0 ? metadataUpdates : null,
  };
}
