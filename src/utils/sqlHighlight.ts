export type TokenType =
  | 'keyword'
  | 'function'
  | 'datatype'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'identifier'
  | 'plain';

export interface SqlToken {
  type: TokenType;
  value: string;
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'ON',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'USING',
  'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'LIMIT', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'TOP', 'DISTINCT', 'ALL',
  'UNION', 'INTERSECT', 'EXCEPT', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'CAST', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'SIMILAR', 'TO',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'MERGE', 'MATCHED',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE', 'INDEX', 'VIEW', 'SCHEMA',
  'DATABASE', 'IF', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK',
  'DEFAULT', 'CONSTRAINT', 'CASCADE', 'RESTRICT', 'RETURNING', 'CONFLICT', 'DO',
  'NOTHING', 'OVER', 'PARTITION', 'WINDOW', 'RANGE', 'UNBOUNDED', 'PRECEDING',
  'FOLLOWING', 'CURRENT', 'ROW', 'TRUE', 'FALSE', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'TRANSACTION', 'EXPLAIN', 'ANALYZE', 'GRANT', 'REVOKE', 'REPLACE', 'TEMP',
  'TEMPORARY', 'EXCLUDED', 'FILTER', 'WITHIN', 'LATERAL', 'ANY', 'SOME',
]);

const DATATYPES = new Set([
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'NUMERIC', 'DECIMAL',
  'FLOAT', 'REAL', 'DOUBLE', 'PRECISION', 'BOOLEAN', 'BOOL', 'CHAR', 'VARCHAR',
  'TEXT', 'NVARCHAR', 'NCHAR', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ',
  'DATETIME', 'INTERVAL', 'UUID', 'JSON', 'JSONB', 'BYTEA', 'BLOB', 'SERIAL',
  'BIGSERIAL', 'ARRAY', 'ENUM', 'STRUCT', 'STRING', 'INT64', 'FLOAT64',
]);

const FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'IFNULL', 'NVL',
  'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'ABS', 'MOD', 'POWER', 'SQRT',
  'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM', 'SUBSTRING', 'SUBSTR', 'CONCAT',
  'LENGTH', 'CHAR_LENGTH', 'REPLACE', 'SPLIT_PART', 'REGEXP_REPLACE',
  'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'DATE_TRUNC', 'DATE_PART',
  'EXTRACT', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'AGE',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE',
  'LAST_VALUE', 'STRING_AGG', 'ARRAY_AGG', 'JSON_AGG', 'JSONB_AGG',
  'GEN_RANDOM_UUID', 'GENERATE_SERIES', 'GREATEST', 'LEAST', 'IIF',
]);

export function tokenizeSqlLine(line: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    // Line comment
    if (ch === '-' && line[i + 1] === '-') {
      tokens.push({ type: 'comment', value: line.slice(i) });
      break;
    }

    // Block comment fragment on single line
    if (ch === '/' && line[i + 1] === '*') {
      const closeIdx = line.indexOf('*/', i + 2);
      if (closeIdx !== -1) {
        tokens.push({ type: 'comment', value: line.slice(i, closeIdx + 2) });
        i = closeIdx + 2;
      } else {
        tokens.push({ type: 'comment', value: line.slice(i) });
        break;
      }
      continue;
    }

    // Single-quoted string
    if (ch === "'") {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "'" && line[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (line[j] === "'") {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ type: 'string', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Double-quoted or backtick identifier
    if (ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        j += 1;
      }
      if (j < line.length) j += 1;
      tokens.push({ type: 'identifier', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9._eE]/.test(line[j])) {
        j += 1;
      }
      tokens.push({ type: 'number', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Words (keywords, functions, datatypes, identifiers)
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) {
        j += 1;
      }
      const word = line.slice(i, j);
      const upper = word.toUpperCase();
      // Check if followed by '(' to detect functions cleanly
      let nextNonSpace = j;
      while (nextNonSpace < line.length && line[nextNonSpace] === ' ') {
        nextNonSpace += 1;
      }
      const isCall = line[nextNonSpace] === '(';

      if (KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (DATATYPES.has(upper)) {
        tokens.push({ type: 'datatype', value: word });
      } else if (FUNCTIONS.has(upper) || isCall) {
        tokens.push({ type: 'function', value: word });
      } else {
        tokens.push({ type: 'plain', value: word });
      }
      i = j;
      continue;
    }

    // Operators and punctuation
    if (/[=<>!+\-*/%(),.;:[\]{}]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && /[=<>!:]/.test(line[j]) && /[=<>!:]/.test(ch)) {
        j += 1;
      }
      tokens.push({ type: 'operator', value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Whitespace or other characters
    let j = i;
    while (j < line.length && /\s/.test(line[j])) {
      j += 1;
    }
    if (j === i) j += 1;
    tokens.push({ type: 'plain', value: line.slice(i, j) });
    i = j;
  }

  return tokens;
}

/**
 * Tokenizes multi-line SQL while tracking multiline /* ... * / block comments.
 */
export function tokenizeSqlLines(sql: string): SqlToken[][] {
  const lines = sql.split('\n');
  const result: SqlToken[][] = [];
  let inBlockComment = false;

  for (const line of lines) {
    if (!inBlockComment) {
      // Check if an unclosed block comment starts on this line
      const openIdx = line.indexOf('/*');
      if (openIdx !== -1) {
        const closeIdx = line.indexOf('*/', openIdx + 2);
        if (closeIdx === -1) {
          const before = line.slice(0, openIdx);
          const commentPart = line.slice(openIdx);
          const tokens = before ? tokenizeSqlLine(before) : [];
          tokens.push({ type: 'comment', value: commentPart });
          result.push(tokens);
          inBlockComment = true;
          continue;
        }
      }
      result.push(tokenizeSqlLine(line));
    } else {
      const closeIdx = line.indexOf('*/');
      if (closeIdx === -1) {
        result.push([{ type: 'comment', value: line }]);
      } else {
        const commentPart = line.slice(0, closeIdx + 2);
        const rest = line.slice(closeIdx + 2);
        const tokens: SqlToken[] = [{ type: 'comment', value: commentPart }];
        if (rest) {
          tokens.push(...tokenizeSqlLine(rest));
        }
        result.push(tokens);
        inBlockComment = false;
      }
    }
  }

  return result;
}

/**
 * Minifies SQL into a single compact line while preserving string literals,
 * quoted identifiers, and stripping SQL comments safely.
 */
export function minifySql(sql: string): string {
  let out = '';
  let i = 0;
  let lastWasSpace = false;

  while (i < sql.length) {
    const ch = sql[i];

    // Strip -- line comments
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    // Strip /* ... */ block comments
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      if (!lastWasSpace && out.length > 0) {
        out += ' ';
        lastWasSpace = true;
      }
      continue;
    }

    // Preserve quoted strings and identifiers verbatim
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) {
          j += 2;
          continue;
        }
        if (sql[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j);
      lastWasSpace = false;
      i = j;
      continue;
    }

    // Collapse whitespace
    if (/\s/.test(ch)) {
      if (!lastWasSpace && out.length > 0) {
        out += ' ';
        lastWasSpace = true;
      }
      i += 1;
      continue;
    }

    // Remove spaces around commas and opening/closing parens cleanly
    if (ch === '(' || ch === ')' || ch === ',' || ch === ';') {
      if (ch !== '(' && lastWasSpace && out.endsWith(' ')) {
        out = out.slice(0, -1);
      }
      out += ch;
      if (ch === ',' || ch === ';') {
        out += ' ';
        lastWasSpace = true;
      } else {
        lastWasSpace = false;
      }
      i += 1;
      continue;
    }

    if (ch === ' ' && out.endsWith('(')) {
      i += 1;
      continue;
    }

    out += ch;
    lastWasSpace = false;
    i += 1;
  }

  return out
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

export function getTextMetrics(text: string): {
  lines: number;
  chars: number;
  statements: number;
} {
  if (!text.trim()) {
    return { lines: 0, chars: 0, statements: 0 };
  }
  const lines = text.split('\n').length;
  const chars = text.length;
  const statements = text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean).length;
  return { lines, chars, statements };
}
