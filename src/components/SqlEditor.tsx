import React, { useRef } from 'react';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onFormatShortcut: () => void;
  placeholder?: string;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  value,
  onChange,
  onFormatShortcut,
  placeholder,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = Math.max(1, value ? value.split('\n').length : 1);
  const lineNumbers = Array.from({ length: lineCount }, (_, idx) => idx + 1);

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

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
        className="w-12 shrink-0 select-none overflow-hidden border-r border-slate-200 bg-slate-50/80 py-4 pr-3 text-right font-mono text-[13px] leading-6 text-slate-400 tabular-nums dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-600"
      >
        {lineNumbers.map((num) => (
          <div key={num}>{num}</div>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-label="Вхідний SQL-запит"
        placeholder={placeholder}
        className="code-scroll h-full w-full resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </div>
  );
};
