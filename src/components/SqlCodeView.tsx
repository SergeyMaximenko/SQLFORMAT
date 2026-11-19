import React, { useMemo } from 'react';
import { FileCode2 } from 'lucide-react';
import { tokenizeSqlLines, type SqlToken, type TokenType } from '../utils/sqlHighlight';
import type { SqlValidationError } from '../utils/sqlValidator';

interface SqlCodeViewProps {
  formattedSql: string;
  rawSql: string;
  hasFormatError: boolean;
  showDiff: boolean;
  onLoadSample: () => void;
  validationErrors?: SqlValidationError[];
  syntaxCheckEnabled?: boolean;
}

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: 'font-semibold text-blue-700 dark:text-sky-400',
  function: 'text-violet-700 dark:text-violet-400',
  datatype: 'text-teal-700 dark:text-teal-400',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-amber-700 dark:text-amber-400',
  comment: 'italic text-slate-400 dark:text-slate-500',
  operator: 'text-slate-500 dark:text-slate-400',
  identifier: 'text-rose-700 dark:text-rose-300',
  plain: 'text-slate-800 dark:text-slate-200',
};

const ERROR_TOKEN_CLASS =
  'rounded-xs bg-red-500/20 font-semibold text-red-700 underline decoration-red-600 decoration-wavy underline-offset-4 dark:bg-red-500/30 dark:text-red-300 dark:decoration-red-400';

interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
  oldNum?: number;
  newNum?: number;
}

function computeLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const m = a.length;
  const n = b.length;

  if (m * n > 25000) {
    return b.map((text, idx) => ({
      kind: 'same',
      text,
      newNum: idx + 1,
    }));
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 1;
  let newNum = 1;

  while (i < m && j < n) {
    if (a[i] === b[j]) {
      diff.push({ kind: 'same', text: b[j], oldNum: oldNum++, newNum: newNum++ });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ kind: 'removed', text: a[i], oldNum: oldNum++ });
      i++;
    } else {
      diff.push({ kind: 'added', text: b[j], newNum: newNum++ });
      j++;
    }
  }

  while (i < m) {
    diff.push({ kind: 'removed', text: a[i], oldNum: oldNum++ });
    i++;
  }
  while (j < n) {
    diff.push({ kind: 'added', text: b[j], newNum: newNum++ });
    j++;
  }

  return diff;
}

interface RenderedTokenSlice {
  value: string;
  type: TokenType;
  isError: boolean;
}

function splitTokensWithErrors(
  tokens: SqlToken[],
  lineStartOffset: number,
  errors: SqlValidationError[]
): RenderedTokenSlice[] {
  if (!errors.length) {
    return tokens.map((t) => ({ value: t.value, type: t.type, isError: false }));
  }

  const slices: RenderedTokenSlice[] = [];
  let offset = lineStartOffset;

  for (const tok of tokens) {
    const tokStart = offset;
    const tokEnd = tokStart + tok.value.length;
    offset = tokEnd;

    const overlapping = errors
      .filter((e) => e.startOffset < tokEnd && e.endOffset > tokStart)
      .sort((a, b) => a.startOffset - b.startOffset);

    if (!overlapping.length) {
      slices.push({ value: tok.value, type: tok.type, isError: false });
      continue;
    }

    let cursor = tokStart;
    for (const err of overlapping) {
      const errStart = Math.max(cursor, err.startOffset);
      const errEnd = Math.min(tokEnd, err.endOffset);
      if (errStart > cursor) {
        slices.push({
          value: tok.value.slice(cursor - tokStart, errStart - tokStart),
          type: tok.type,
          isError: false,
        });
      }
      if (errEnd > errStart) {
        slices.push({
          value: tok.value.slice(errStart - tokStart, errEnd - tokStart),
          type: tok.type,
          isError: true,
        });
        cursor = errEnd;
      }
    }

    if (cursor < tokEnd) {
      slices.push({
        value: tok.value.slice(cursor - tokStart),
        type: tok.type,
        isError: false,
      });
    }
  }

  return slices;
}

export const SqlCodeView: React.FC<SqlCodeViewProps> = ({
  formattedSql,
  rawSql,
  hasFormatError,
  showDiff,
  onLoadSample,
  validationErrors = [],
  syntaxCheckEnabled = false,
}) => {
  const displaySql = hasFormatError ? rawSql : formattedSql;

  const tokenizedLines = useMemo(
    () => (displaySql ? tokenizeSqlLines(displaySql) : []),
    [displaySql]
  );

  const lineStartOffsets = useMemo(() => {
    if (!displaySql) return [];
    const lines = displaySql.split('\n');
    const offsets: number[] = [];
    let acc = 0;
    for (const line of lines) {
      offsets.push(acc);
      acc += line.length + 1;
    }
    return offsets;
  }, [displaySql]);

  const activeErrors = useMemo(
    () => (syntaxCheckEnabled || hasFormatError ? validationErrors : []),
    [syntaxCheckEnabled, hasFormatError, validationErrors]
  );

  const errorLineSet = useMemo(
    () => new Set(activeErrors.map((e) => e.line)),
    [activeErrors]
  );

  const diffLines = useMemo(
    () =>
      showDiff && formattedSql && !hasFormatError
        ? computeLineDiff(rawSql, formattedSql)
        : [],
    [showDiff, rawSql, formattedSql, hasFormatError]
  );

  if (!displaySql.trim()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center dark:bg-slate-900">
        <div className="max-w-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <FileCode2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Тут з’явиться відформатований SQL
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Вставте запит у поле ліворуч або завантажте готовий приклад, щоб
            побачити структурований результат із підсвічуванням.
          </p>
          <button
            type="button"
            onClick={onLoadSample}
            className="mt-5 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            Вставити приклад запиту
          </button>
        </div>
      </div>
    );
  }

  if (showDiff && !hasFormatError) {
    return (
      <div className="code-scroll flex-1 min-h-0 overflow-auto bg-white py-4 font-mono text-[13px] leading-6 dark:bg-slate-900">
        <div className="min-w-max">
          {diffLines.map((line, idx) => {
            const rowClass =
              line.kind === 'added'
                ? 'bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-200'
                : line.kind === 'removed'
                  ? 'bg-red-50/90 text-red-900 dark:bg-red-950/35 dark:text-red-300'
                  : 'text-slate-700 dark:text-slate-300';

            const prefix =
              line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';

            return (
              <div key={idx} className={`flex px-4 ${rowClass}`}>
                <span className="w-10 shrink-0 select-none pr-2 text-right text-xs leading-6 text-slate-400 tabular-nums dark:text-slate-600">
                  {line.newNum ?? line.oldNum ?? ''}
                </span>
                <span className="w-5 shrink-0 select-none font-semibold opacity-75">
                  {prefix}
                </span>
                <span className="whitespace-pre">{line.text || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="code-scroll flex-1 min-h-0 overflow-auto bg-white dark:bg-slate-900">
      <div className="flex min-w-max py-4 font-mono text-[13px] leading-6">
        <div
          aria-hidden="true"
          className="w-12 shrink-0 select-none border-r border-slate-200 bg-slate-50/80 text-right text-slate-400 tabular-nums dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-600"
        >
          {tokenizedLines.map((_, idx) => {
            const hasError = errorLineSet.has(idx + 1);
            return (
              <div
                key={idx}
                className={`pr-3 ${
                  hasError
                    ? 'bg-red-500/15 font-semibold text-red-600 dark:bg-red-500/20 dark:text-red-400'
                    : ''
                }`}
              >
                {idx + 1}
              </div>
            );
          })}
        </div>
        <pre className="flex-1 px-4 font-mono text-[13px] leading-6">
          <code>
            {tokenizedLines.map((tokens, lineIdx) => {
              const slices = splitTokensWithErrors(
                tokens,
                lineStartOffsets[lineIdx] ?? 0,
                activeErrors
              );
              return (
                <div key={lineIdx} className="whitespace-pre">
                  {slices.length === 0 ? (
                    '\u00A0'
                  ) : (
                    slices.map((slice, sliceIdx) => (
                      <span
                        key={sliceIdx}
                        className={
                          slice.isError
                            ? ERROR_TOKEN_CLASS
                            : TOKEN_CLASSES[slice.type]
                        }
                      >
                        {slice.value}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
};
