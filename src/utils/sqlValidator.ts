import { Parser } from 'node-sql-parser';
import type { SqlLanguage } from 'sql-formatter';

export interface SqlValidationError {
  id: string;
  message: string;
  hint?: string;
  line: number;
  column: number;
  startOffset: number;
  endOffset: number;
  snippet: string;
}

const parser = new Parser();

const DIALECT_TO_PARSER_DB: Record<SqlLanguage, string> = {
  sql: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'Sqlite',
  transactsql: 'TransactSQL',
  tsql: 'TransactSQL',
  bigquery: 'BigQuery',
  plsql: 'PostgreSQL',
  snowflake: 'Snowflake',
  clickhouse: 'MySQL',
  duckdb: 'PostgreSQL',
  redshift: 'Redshift',
  trino: 'Trino',
  spark: 'Hive',
  hive: 'Hive',
  db2: 'PostgreSQL',
  db2i: 'PostgreSQL',
  n1ql: 'PostgreSQL',
  singlestoredb: 'MySQL',
  tidb: 'MySQL',
};

const CORE_SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'JOIN',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'ON', 'USING', 'GROUP', 'BY',
  'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'AS',
  'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
  'ILIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'RETURNING',
  'CONFLICT', 'TRUNCATE', 'ASC', 'DESC', 'PRIMARY', 'KEY', 'FOREIGN',
  'REFERENCES', 'DEFAULT', 'CONSTRAINT', 'CHECK', 'UNIQUE', 'CASCADE',
];

const CLAUSE_KEYWORDS = new Set([
  'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT', 'RETURNING', 'SET', 'VALUES',
]);

function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < safeOffset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: safeOffset - lastNewline };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findClosestKeyword(word: string): string | null {
  if (!word || word.length < 3 || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(word)) {
    return null;
  }
  const hasDigit = /[0-9]/.test(word);
  if (hasDigit && word.length < 4) return null;

  const upper = word.toUpperCase();
  if (CORE_SQL_KEYWORDS.includes(upper)) return null;

  let best: string | null = null;
  let bestDist = Infinity;

  for (const kw of CORE_SQL_KEYWORDS) {
    if (hasDigit && kw.length < 4) continue;
    if (Math.abs(kw.length - upper.length) > 2) continue;
    const dist = levenshtein(upper, kw);
    const maxAllowed = kw.length <= 4 ? 1 : 2;
    if (dist <= maxAllowed && dist < bestDist) {
      bestDist = dist;
      best = kw;
    }
  }
  return best;
}

interface LexicalIssue {
  message: string;
  hint?: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Checks for unclosed quotes, unclosed block comments, unmatched parentheses,
 * and trailing commas directly before SQL clause keywords.
 */
function findLexicalIssues(sql: string): LexicalIssue[] {
  const issues: LexicalIssue[] = [];
  const parenStack: number[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // -- line comment
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // /* block comment */
    if (ch === '/' && sql[i + 1] === '*') {
      const closeIdx = sql.indexOf('*/', i + 2);
      if (closeIdx === -1) {
        issues.push({
          message: 'Незакритий багаторядковий коментар "/*"',
          hint: 'Додайте "*/" у кінці коментаря.',
          startOffset: i,
          endOffset: Math.min(i + 2, sql.length),
        });
        return issues;
      }
      i = closeIdx + 2;
      continue;
    }

    // Quoted strings and identifiers
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      const start = i;
      let j = i + 1;
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) {
          j += 2;
          continue;
        }
        if (sql[j] === '\\' && quote === "'" && j + 1 < sql.length) {
          j += 2;
          continue;
        }
        if (sql[j] === quote) {
          j += 1;
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) {
        const label =
          quote === "'"
            ? 'Незакритий рядковий літерал'
            : `Незакритий ідентифікатор у лапках (${quote})`;
        issues.push({
          message: label,
          hint: `Додайте закриваючу лапку ${quote}.`,
          startOffset: start,
          endOffset: Math.min(sql.length, Math.max(start + 1, sql.indexOf('\n', start) === -1 ? sql.length : sql.indexOf('\n', start))),
        });
        return issues;
      }
      i = j;
      continue;
    }

    if (ch === '(') {
      parenStack.push(i);
      i++;
      continue;
    }

    if (ch === ')') {
      if (parenStack.length === 0) {
        issues.push({
          message: 'Зайва закриваюча дужка ")"',
          hint: 'Видаліть зайву ")" або додайте відкриваючу "(" раніше.',
          startOffset: i,
          endOffset: i + 1,
        });
      } else {
        parenStack.pop();
      }
      i++;
      continue;
    }

    // Check trailing comma right before clause keyword or ')'
    if (ch === ',') {
      let j = i + 1;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      if (sql[j] === ')') {
        issues.push({
          message: 'Зайва кома перед закриваючою дужкою ")"',
          hint: 'Приберіть кому перед ")".',
          startOffset: i,
          endOffset: i + 1,
        });
      } else if (j < sql.length && /[a-zA-Z]/.test(sql[j])) {
        let k = j;
        while (k < sql.length && /[a-zA-Z_]/.test(sql[k])) k++;
        const nextWord = sql.slice(j, k).toUpperCase();
        if (CLAUSE_KEYWORDS.has(nextWord)) {
          issues.push({
            message: `Зайва кома перед ключовим словом "${nextWord}"`,
            hint: `Видаліть кому перед "${nextWord}".`,
            startOffset: i,
            endOffset: i + 1,
          });
        }
      }
      i++;
      continue;
    }

    i++;
  }

  for (const openIdx of parenStack) {
    issues.push({
      message: 'Незакрита відкриваюча дужка "("',
      hint: 'Додайте відповідну закриваючу дужку ")".',
      startOffset: openIdx,
      endOffset: openIdx + 1,
    });
  }

  return issues;
}

interface StatementSlice {
  text: string;
  startOffset: number;
}

function splitSqlStatements(sql: string): StatementSlice[] {
  const slices: StatementSlice[] = [];
  let stmtStart = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === ';') {
      const rawSlice = sql.slice(stmtStart, i);
      if (rawSlice.trim()) {
        slices.push({ text: rawSlice, startOffset: stmtStart });
      }
      stmtStart = i + 1;
    }
    i++;
  }

  const tail = sql.slice(stmtStart);
  if (tail.trim()) {
    slices.push({ text: tail, startOffset: stmtStart });
  }

  return slices;
}

function extractTokenSpanAt(sql: string, offset: number): { start: number; end: number; token: string } {
  if (!sql.length) return { start: 0, end: 0, token: '' };
  let pos = Math.max(0, Math.min(offset, sql.length - 1));

  // If offset points at whitespace, move forward to next token or backward to previous
  if (/\s/.test(sql[pos])) {
    let fwd = pos;
    while (fwd < sql.length && /\s/.test(sql[fwd])) fwd++;
    if (fwd < sql.length) {
      pos = fwd;
    } else {
      let bwd = pos;
      while (bwd > 0 && /\s/.test(sql[bwd])) bwd--;
      pos = bwd;
    }
  }

  if (/[a-zA-Z0-9_$]/.test(sql[pos])) {
    let start = pos;
    let end = pos + 1;
    while (start > 0 && /[a-zA-Z0-9_$]/.test(sql[start - 1])) start--;
    while (end < sql.length && /[a-zA-Z0-9_$]/.test(sql[end])) end++;
    return { start, end, token: sql.slice(start, end) };
  }

  return { start: pos, end: Math.min(pos + 1, sql.length), token: sql[pos] ?? '' };
}

function extractPreviousWordSpan(sql: string, offset: number): { start: number; end: number; token: string } | null {
  let pos = Math.min(offset, sql.length) - 1;
  while (pos >= 0 && /\s/.test(sql[pos])) pos--;
  if (pos < 0 || !/[a-zA-Z0-9_$]/.test(sql[pos])) return null;
  let start = pos;
  const end = pos + 1;
  while (start > 0 && /[a-zA-Z0-9_$]/.test(sql[start - 1])) start--;
  return { start, end, token: sql.slice(start, end) };
}

function translateParserMessage(err: unknown, foundToken: string, prevTypo: string | null, prevToken: string): {
  message: string;
  hint?: string;
} {
  if (prevTypo && prevToken) {
    return {
      message: `Невідоме ключове слово "${prevToken}"`,
      hint: `Можливо, ви мали на увазі "${prevTypo}"?`,
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);

  if (rawMsg.includes('end of input found')) {
    return {
      message: 'Незавершена SQL-команда — очікувалося продовження запиту',
      hint: 'Перевірте, чи не пропущено таблицю, умову або закриваючі символи.',
    };
  }

  if (foundToken) {
    const tokenTypo = findClosestKeyword(foundToken);
    if (tokenTypo) {
      return {
        message: `Синтаксична помилка біля "${foundToken}"`,
        hint: `Можливо, ви мали на увазі "${tokenTypo}"?`,
      };
    }
    return {
      message: `Неочікуваний фрагмент "${foundToken}" у SQL-команді`,
      hint: 'Перевірте порядок ключових слів, наявність ком або дужок перед цим місцем.',
    };
  }

  return {
    message: 'Синтаксична помилка у SQL-команді',
    hint: rawMsg,
  };
}

export function validateSqlSyntax(sql: string, language: SqlLanguage): SqlValidationError[] {
  if (!sql.trim()) return [];

  const errors: SqlValidationError[] = [];
  const db = DIALECT_TO_PARSER_DB[language] ?? 'PostgreSQL';

  // 1. Lexical checks (unclosed quotes, comments, unmatched parens, trailing commas)
  const lexicalIssues = findLexicalIssues(sql);
  for (const issue of lexicalIssues) {
    const { line, column } = offsetToLineCol(sql, issue.startOffset);
    errors.push({
      id: `lex-${issue.startOffset}-${issue.endOffset}`,
      message: issue.message,
      hint: issue.hint,
      line,
      column,
      startOffset: issue.startOffset,
      endOffset: Math.max(issue.startOffset + 1, issue.endOffset),
      snippet: sql.slice(issue.startOffset, Math.max(issue.startOffset + 1, issue.endOffset)),
    });
  }

  // If unclosed quote/comment exists, stop before AST parsing to avoid duplicate cascade errors
  if (
    lexicalIssues.some(
      (iss) =>
        iss.message.includes('Незакритий рядковий') ||
        iss.message.includes('Незакритий ідентифікатор') ||
        iss.message.includes('коментар')
    )
  ) {
    return errors;
  }

  // 2. Statement-by-statement AST parsing with node-sql-parser
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    // Skip comment-only slices
    const withoutComments = stmt.text
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    if (!withoutComments) continue;

    try {
      parser.astify(stmt.text, { database: db });
    } catch (err: unknown) {
      const errObj = err as {
        location?: { start?: { offset?: number }; end?: { offset?: number } };
        found?: string | null;
      };
      const localOffset = errObj?.location?.start?.offset ?? 0;
      const globalOffset = Math.min(
        sql.length,
        stmt.startOffset + Math.max(0, localOffset)
      );

      // Skip if this exact area already has a lexical error (e.g., trailing comma or paren)
      const overlapsLexical = errors.some(
        (e) => Math.abs(e.startOffset - globalOffset) <= 3
      );
      if (overlapsLexical) continue;

      const atToken = extractTokenSpanAt(sql, globalOffset);
      const prevWord = extractPreviousWordSpan(sql, globalOffset);
      const prevTypo = prevWord ? findClosestKeyword(prevWord.token) : null;

      // If the previous word is a clear SQL keyword typo (e.g. SELEC, FORM, WHER), highlight THAT word!
      const highlightSpan =
        prevTypo && prevWord
          ? prevWord
          : atToken;

      const { line, column } = offsetToLineCol(sql, highlightSpan.start);
      const translated = translateParserMessage(
        err,
        atToken.token,
        prevTypo,
        prevWord?.token ?? ''
      );

      errors.push({
        id: `ast-${highlightSpan.start}-${highlightSpan.end}`,
        message: translated.message,
        hint: translated.hint,
        line,
        column,
        startOffset: highlightSpan.start,
        endOffset: Math.max(highlightSpan.start + 1, highlightSpan.end),
        snippet: sql.slice(
          highlightSpan.start,
          Math.max(highlightSpan.start + 1, highlightSpan.end)
        ),
      });
    }
  }

  return errors.sort((a, b) => a.startOffset - b.startOffset);
}
