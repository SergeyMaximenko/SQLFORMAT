import React, { useEffect, useMemo, useRef } from 'react';
import type { SqlValidationError } from '../utils/sqlValidator';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFormatShortcut: () => void;
  placeholder?: string;
  errors?: SqlValidationError[];
  syntaxCheckEnabled?: boolean;
  jumpTarget?: { offset: number; seq: number } | null;
}

interface HighlightSegment {
  text: string;
  isError: boolean;
  errorMessage?: string;
}

function buildHighlightSegments(
  text: string,
  errors: SqlValidationError[]
): HighlightSegment[] {
  if (!text) return [];
  if (!errors.length) return [{ text, isError: false }];

  // Merge or normalize non-overlapping sorted ranges
  const sorted = [...errors]
    .filter((e) => e.endOffset > e.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const err of sorted) {
    const start = Math.max(cursor, Math.min(err.startOffset, text.length));
    const end = Math.max(start, Math.min(err.endOffset, text.length));
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), isError: false });
    }
    if (end > start) {
      segments.push({
        text: text.slice(start, end),
        isError: true,
        errorMessage: err.message,
      });
      cursor = end;
    }
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isError: false });
  }

  return segments;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  value,
  onChange,
  onFormatShortcut,
  placeholder,
  errors = [],
  syntaxCheckEnabled = false,
  jumpTarget = null,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const lineCount = Math.max(1, value ? value.split('\n').length : 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, idx) => idx + 1);

  const errorLines = useMemo(() => {
    if (!syntaxCheckEnabled) return new Set<number>();
    return new Set(errors.map((e) => e.line));
  }, [errors, syntaxCheckEnabled]);

  const highlightSegments = useMemo(
    () =>
      syntaxCheckEnabled ? buildHighlightSegments(value, errors) : [{ text: value, isError: false }],
    [value, errors, syntaxCheckEnabled]
  );

  const handleScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    if (backdropRef.current) {
      backdropRef.current.scrollTop = ta.scrollTop;
      backdropRef.current.scrollLeft = ta.scrollLeft;
    }
  };

  useEffect(() => {
    if (!jumpTarget || !textareaRef.current) return;
    const ta = textareaRef.current;
    const pos = Math.max(0, Math.min(jumpTarget.offset, value.length));
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }, [jumpTarget, value.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onFormatShortcut();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue = value.slice(0, start) + '  ' + value.slice(end);
      onChange(nextValue);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (
      file.name.endsWith('.sql') ||
      file.name.endsWith('.txt') ||
      file.type.startsWith('text/')
    ) {
      const content = await file.text();
      onChange(content);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative flex flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900"
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-12 shrink-0 select-none overflow-hidden border-r border-slate-200 bg-slate-50/80 py-4 text-right font-mono text-[13px] leading-6 text-slate-400 tabular-nums dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-600"
      >
        {lineNumbers.map((num) => {
          const hasError = errorLines.has(num);
          return (
            <div
              key={num}
              className={`pr-3 ${
                hasError
                  ? 'bg-red-500/15 font-semibold text-red-600 dark:bg-red-500/20 dark:text-red-400'
                  : ''
              }`}
            >
              {num}
            </div>
          );
        })}
      </div>

      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Pixel-aligned underlay showing red error underlines and highlights */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-4 font-mono text-[13px] leading-6 whitespace-pre text-transparent select-none"
        >
          {highlightSegments.map((seg, idx) =>
            seg.isError ? (
              <mark
                key={idx}
                className="rounded-xs bg-red-500/20 text-transparent underline decoration-red-600 decoration-wavy decoration-2 underline-offset-4 dark:bg-red-500/30 dark:decoration-red-400"
              >
                {seg.text}
              </mark>
            ) : (
              <span key={idx}>{seg.text}</span>
            )
          )}
          {'\n'}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Вхідний SQL-запит"
          placeholder={placeholder}
          className="code-scroll relative z-10 h-full w-full resize-none overflow-auto bg-transparent px-4 py-4 font-mono text-[13px] leading-6 whitespace-pre text-slate-900 caret-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:caret-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
    </div>
  );
};
