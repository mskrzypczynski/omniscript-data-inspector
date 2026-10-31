'use strict';

/* Evaluates the common subset of OmniScript formulas, best effort, so a value
 * that depends on one can still be shown. The result is always an estimate:
 * the script's own engine decides what really happens.
 *
 * Supported: numbers, "strings" and 'strings', TRUE / FALSE / NULL,
 * %Field% and %Step:Field% merge references (read through `lookup`), the
 * operators + - * / (numbers only), comparisons = == != <> < <= > >=, & (text
 * concatenation) and parentheses, and the functions IF, AND, OR, NOT, ISBLANK,
 * ISNULL, CONCAT, LEN, UPPER, LOWER, TRIM, ABS, ROUND, FLOOR, CEILING, MAX,
 * MIN, SUM, AVERAGE, NUMBER and TEXT.
 *
 * Precedence, loosest first: comparisons, &, + -, * /, unary minus.
 *
 * Never guesses: an unknown function, a syntax error, a reference that holds
 * nothing (ISBLANK and ISNULL aside), text where a number is needed or a
 * division by zero gives { ok: false, reason }, not a made-up value. It does
 * not use eval or Function, and it never throws.
 *
 * Pure: no DOM, no chrome.*. */

const MAX_LENGTH = 4000;
const MAX_DEPTH = 40;

/* A leading "=" marks a value as a formula in a rule or a Set Values map. */
export function isFormulaText(text) {
  return typeof text === 'string' && text.trim().startsWith('=');
}

/* "The formula could not be evaluated: <why>" for a tooltip. A reason that
 * already starts "The formula ..." or "The result ..." is the whole sentence
 * (the evaluator's catch-all reads "The formula could not be evaluated"), so it
 * is not wrapped again. */
export function notEvaluatedText(reason) {
  const text = String(reason === undefined || reason === null ? '' : reason).trim().replace(/\.$/, '');
  if (!text) return 'The formula could not be evaluated';
  return /^The (formula|result)\b/i.test(text) ? text : `The formula could not be evaluated: ${text}`;
}

class FormulaError extends Error {}
const fail = (reason) => { throw new FormulaError(reason); };

/* ------------------------------------------------------------ tokens */

const TWO = ['<=', '>=', '<>', '!=', '=='];
const ONE = '+-*/=<>&(),';

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }

    if (ch === '%') {
      const end = text.indexOf('%', i + 1);
      if (end < 0) fail('Syntax error: a % reference is not closed');
      const path = text.slice(i + 1, end).trim();
      if (!path) fail('Syntax error: an empty % reference');
      tokens.push({ t: 'ref', v: path });
      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      let out = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) { out += text[j + 1]; j += 2; continue; }
        if (text[j] === ch) {
          if (text[j + 1] === ch) { out += ch; j += 2; continue; } // "" inside "..." is a quote
          closed = true;
          break;
        }
        out += text[j++];
      }
      if (!closed) fail('Syntax error: a text is not closed');
      tokens.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }

    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(i));
    if (number) {
      tokens.push({ t: 'num', v: Number(number[0]) });
      i += number[0].length;
      continue;
    }

    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (word) {
      tokens.push({ t: 'word', v: word[0] });
      i += word[0].length;
      continue;
    }

    const pair = text.slice(i, i + 2);
    if (TWO.includes(pair)) { tokens.push({ t: 'op', v: pair === '==' ? '=' : pair }); i += 2; continue; }
    if (ONE.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }

    fail(`Syntax error: unexpected "${ch}"`);
  }
  return tokens;
}

/* ------------------------------------------------------------ parser */

function parse(tokens) {
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (value) => peek() && peek().t === 'op' && peek().v === value;
  const take = () => tokens[at++];
  const expect = (value) => {
    if (!isOp(value)) fail(`Syntax error: expected "${value}"`);
    at++;
  };

  function level(next, operators, depth) {
    let left = next(depth);
    while (peek() && peek().t === 'op' && operators.includes(peek().v)) {
      const op = take().v;
      left = { t: 'bin', op, l: left, r: next(depth) };
    }
    return left;
  }

  const comparison = (depth) => level(concat, ['=', '!=', '<>', '<', '<=', '>', '>='], depth);
  const concat = (depth) => level(additive, ['&'], depth);
  const additive = (depth) => level(multiplicative, ['+', '-'], depth);
  const multiplicative = (depth) => level(unary, ['*', '/'], depth);

  function unary(depth) {
    if (isOp('-')) { take(); return { t: 'neg', e: unary(depth) }; }
    if (isOp('+')) { take(); return unary(depth); }
    return primary(depth);
  }

  function primary(depth) {
    if (depth > MAX_DEPTH) fail('The formula is nested too deeply');
    const token = take();
    if (!token) fail('Syntax error: the formula ends too soon');
    if (token.t === 'num') return { t: 'lit', v: token.v };
    if (token.t === 'str') return { t: 'lit', v: token.v };
    if (token.t === 'ref') return { t: 'ref', path: token.v };
    if (token.t === 'op' && token.v === '(') {
      const inner = comparison(depth + 1);
      expect(')');
      return inner;
    }
    if (token.t === 'word') {
      if (isOp('(')) {
        take();
        const args = [];
        if (!isOp(')')) {
          args.push(comparison(depth + 1));
          while (isOp(',')) { take(); args.push(comparison(depth + 1)); }
        }
        expect(')');
        return { t: 'call', name: token.v.toUpperCase(), args };
      }
      const word = token.v.toUpperCase();
      if (word === 'TRUE') return { t: 'lit', v: true };
      if (word === 'FALSE') return { t: 'lit', v: false };
      if (word === 'NULL') return { t: 'lit', v: null };
      fail(`Unknown name ${token.v}`);
    }
    return fail(`Syntax error: unexpected "${token.v}"`);
  }

  const tree = comparison(0);
  if (at < tokens.length) fail(`Syntax error: unexpected "${tokens[at].v}"`);
  return tree;
}

/* -------------------------------------------------------- evaluation */

/* What a reference that holds nothing evaluates to. Only ISBLANK / ISNULL may
 * look at it; every other use fails and names the field. */
const missing = (path) => ({ missing: path });
const isMissing = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && 'missing' in value;

function present(value) {
  if (isMissing(value)) fail(`No value for %${value.missing}%`);
  return value;
}

const shown = (value) => (typeof value === 'string' ? JSON.stringify(value) : String(value));

/* 0.1 + 0.2 is 0.3 here, not 0.30000000000000004. */
const tidy = (n) => Number(n.toPrecision(15));

function toNumber(raw) {
  const value = present(raw);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fail(`${value !== null && typeof value === 'object' ? 'A list or object' : shown(value)} is not a number`);
}

function toText(raw) {
  const value = present(raw);
  if (value === null) return '';
  if (typeof value === 'object') return fail('A list or object cannot be used as text');
  return String(value);
}

function toBool(raw) {
  const value = present(raw);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (/^true$/i.test(value.trim())) return true;
    if (/^false$/i.test(value.trim())) return false;
  }
  return fail(`${shown(value)} is not true or false`);
}

/* Two numbers (or numeric texts) compare as numbers, anything else as text. */
function compareValues(a, op, b) {
  const left = present(a);
  const right = present(b);
  if ((left !== null && typeof left === 'object') || (right !== null && typeof right === 'object')) {
    fail('A list or object cannot be compared');
  }
  const numeric = (v) => (typeof v === 'number' ? v
    : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
  const x = numeric(left);
  const y = numeric(right);
  const both = x !== null && y !== null;
  const l = both ? x : (left === null ? '' : String(left));
  const r = both ? y : (right === null ? '' : String(right));
  switch (op) {
    case '=': return l === r;
    case '!=': case '<>': return l !== r;
    case '<': return l < r;
    case '<=': return l <= r;
    case '>': return l > r;
    default: return l >= r;
  }
}

/* Round half away from zero, on the decimal text, so 1.005 stays 1.01. */
function roundTo(value, digits) {
  const places = Math.max(0, Math.min(15, Math.trunc(digits)));
  const factor = Number(`1e${places}`);
  const scaled = Math.round(Math.abs(value) * factor + 1e-9);
  return Math.sign(value) * (scaled / factor);
}

const isBlank = (value) => isMissing(value) || value === null || value === undefined ||
  (typeof value === 'string' && value.trim() === '');

/* The numbers of every argument; a list (a repeat block's column) counts item by item. */
function numbers(values, name) {
  const out = [];
  values.forEach((raw) => {
    const value = present(raw);
    if (Array.isArray(value)) value.forEach((item) => out.push(toNumber(item)));
    else out.push(toNumber(value));
  });
  if (!out.length) fail(`${name} needs at least one value`);
  return out;
}

function arity(name, args, min, max) {
  if (args.length < min || args.length > max) {
    fail(`${name} needs ${min === max ? min : `${min} to ${max === Infinity ? 'many' : max}`} ${min === 1 && max === 1 ? 'value' : 'values'}`);
  }
}

/* Functions that take their arguments already evaluated. */
const FUNCTIONS = {
  ISBLANK: (a) => { arity('ISBLANK', a, 1, 1); return isBlank(a[0]); },
  ISNULL: (a) => { arity('ISNULL', a, 1, 1); return isBlank(a[0]); },
  CONCAT: (a) => { arity('CONCAT', a, 1, Infinity); return a.map(toText).join(''); },
  LEN: (a) => { arity('LEN', a, 1, 1); return toText(a[0]).length; },
  UPPER: (a) => { arity('UPPER', a, 1, 1); return toText(a[0]).toUpperCase(); },
  LOWER: (a) => { arity('LOWER', a, 1, 1); return toText(a[0]).toLowerCase(); },
  TRIM: (a) => { arity('TRIM', a, 1, 1); return toText(a[0]).trim(); },
  ABS: (a) => { arity('ABS', a, 1, 1); return Math.abs(toNumber(a[0])); },
  ROUND: (a) => {
    arity('ROUND', a, 1, 2);
    return tidy(roundTo(toNumber(a[0]), a.length > 1 ? toNumber(a[1]) : 0));
  },
  FLOOR: (a) => { arity('FLOOR', a, 1, 1); return Math.floor(toNumber(a[0])); },
  CEILING: (a) => { arity('CEILING', a, 1, 1); return Math.ceil(toNumber(a[0])); },
  MAX: (a) => Math.max(...numbers(a, 'MAX')),
  MIN: (a) => Math.min(...numbers(a, 'MIN')),
  SUM: (a) => tidy(numbers(a, 'SUM').reduce((sum, n) => sum + n, 0)),
  AVERAGE: (a) => { const list = numbers(a, 'AVERAGE'); return tidy(list.reduce((sum, n) => sum + n, 0) / list.length); },
  NUMBER: (a) => { arity('NUMBER', a, 1, 1); return toNumber(a[0]); },
  TEXT: (a) => { arity('TEXT', a, 1, 1); return toText(a[0]); },
  NOT: (a) => { arity('NOT', a, 1, 1); return !toBool(a[0]); }
};

export const FORMULA_FUNCTIONS = Object.freeze(
  ['IF', 'AND', 'OR', ...Object.keys(FUNCTIONS)].sort()
);

function run(node, lookup) {
  switch (node.t) {
    case 'lit': return node.v;
    case 'ref': {
      const value = lookup(node.path);
      return value === undefined ? missing(node.path) : value;
    }
    case 'neg': return -toNumber(run(node.e, lookup));
    case 'bin': return binary(node, lookup);
    default: return call(node, lookup);
  }
}

function binary(node, lookup) {
  const left = run(node.l, lookup);
  const right = run(node.r, lookup);
  switch (node.op) {
    case '&': return toText(left) + toText(right);
    case '+': return tidy(toNumber(left) + toNumber(right));
    case '-': return tidy(toNumber(left) - toNumber(right));
    case '*': return tidy(toNumber(left) * toNumber(right));
    case '/': {
      const divisor = toNumber(right);
      if (divisor === 0) fail('Division by zero');
      return tidy(toNumber(left) / divisor);
    }
    default: return compareValues(left, node.op, right);
  }
}

/* IF, AND and OR read only as many of their arguments as they need, so a
 * field that is not there yet in the branch not taken does not matter. */
function call(node, lookup) {
  const { name, args } = node;
  if (name === 'IF') {
    arity('IF', args, 2, 3);
    if (toBool(run(args[0], lookup))) return run(args[1], lookup);
    return args.length > 2 ? run(args[2], lookup) : false;
  }
  if (name === 'AND' || name === 'OR') {
    arity(name, args, 1, Infinity);
    const stopOn = name === 'OR';
    for (const arg of args) {
      if (toBool(run(arg, lookup)) === stopOn) return stopOn;
    }
    return !stopOn;
  }
  const fn = FUNCTIONS[name];
  if (!fn) fail(`Unknown function ${name}`);
  return fn(args.map((arg) => run(arg, lookup)));
}

/* { ok: true, value } with a number, text, boolean or null, or
 * { ok: false, reason }. `lookup(path)` returns what a %merge% reference holds
 * (undefined for nothing); the path is as written between the percent signs. */
export function evaluateFormula(text, lookup = () => undefined) {
  try {
    if (typeof text !== 'string') return { ok: false, reason: 'Not a formula' };
    let source = text.trim();
    if (source.startsWith('=')) source = source.slice(1).trim();
    if (!source) return { ok: false, reason: 'The formula is empty' };
    if (source.length > MAX_LENGTH) return { ok: false, reason: 'The formula is too long to evaluate' };

    const value = present(run(parse(tokenize(source)), lookup));
    if (typeof value === 'object' && value !== null) return { ok: false, reason: 'The formula gives a list or object' };
    if (typeof value === 'number' && !Number.isFinite(value)) return { ok: false, reason: 'The result is not a number' };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, reason: error.message };
    return { ok: false, reason: 'The formula could not be evaluated' };
  }
}

/* A result as it is written next to the ≈ sign: text in quotes, the rest bare. */
export function formatFormulaValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}
