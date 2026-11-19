import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  format as formatSqlQuery,
  type IndentStyle,
  type KeywordCase,
  type LogicalOperatorNewline,
  type SqlLanguage,
} from 'sql-formatter';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  GitCompare,
  Minimize2,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { SQL_DIALECTS, SQL_PRESETS, type SqlPreset } from './data/sqlPresets';
import { getTextMetrics, minifySql } from './utils/sqlHighlight';
import { validateSqlSyntax } from './utils/sqlValidator';
import { SqlEditor } from './components/SqlEditor';
import { SqlCodeView } from './components/SqlCodeView';

type ActiveTab = 'editor' | 'presets' | 'history';

interface FormatConfig {
  language: SqlLanguage;
  keywordCase: KeywordCase;
  indentType: '2spaces' | '4spaces' | 'tab';
  indentStyle: IndentStyle;
  logicalOperatorNewline: LogicalOperatorNewline;
  linesBetweenQueries: number;
  autoFormat: boolean;
  syntaxCheck: boolean;
}

interface HistoryEntry {
  id: string;
  createdAt: string;
  language: SqlLanguage;
  inputSql: string;
  formattedSql: string;
}

const HISTORY_STORAGE_KEY = 'sql_formatter_history_v1';
const THEME_STORAGE_KEY = 'sql_formatter_theme_v1';

const DEFAULT_CONFIG: FormatConfig = {
  language: 'postgresql',
  keywordCase: 'upper',
  indentType: '2spaces',
  indentStyle: 'standard',
  logicalOperatorNewline: 'before',
  linesBetweenQueries: 2,
  autoFormat: true,
  syntaxCheck: true,
};

function runSqlFormat(input: string, cfg: FormatConfig): { output: string; error: string | null } {
  if (!input.trim()) {
    return { output: '', error: null };
  }

  try {
    const formatted = formatSqlQuery(input, {
      language: cfg.language,
      keywordCase: cfg.keywordCase,
      dataTypeCase: cfg.keywordCase,
      functionCase: cfg.keywordCase,
      tabWidth: cfg.indentType === '4spaces' ? 4 : 2,
      useTabs: cfg.indentType === 'tab',
      indentStyle: cfg.indentStyle,
      logicalOperatorNewline: cfg.logicalOperatorNewline,
      linesBetweenQueries: cfg.linesBetweenQueries,
    });
    return { output: formatted, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Невідома помилка форматування SQL';
    return { output: '', error: message };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [config, setConfig] = useState<FormatConfig>(DEFAULT_CONFIG);
  const [inputSql, setInputSql] = useState<string>(SQL_PRESETS[0].query);
  const [outputSql, setOutputSql] = useState<string>(() => {
    return runSqlFormat(SQL_PRESETS[0].query, DEFAULT_CONFIG).output;
  });
  const [formatError, setFormatError] = useState<string | null>(null);
  const [isMinified, setIsMinified] = useState<boolean>(false);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState<number>(0);
  const [jumpTarget, setJumpTarget] = useState<{ offset: number; seq: number } | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage failures
    }
  }, [history]);

  const saveToHistory = useCallback(
    (rawInput: string, formatted: string, lang: SqlLanguage) => {
      if (!rawInput.trim() || !formatted.trim()) return;
      setHistory((prev) => {
        if (prev[0]?.formattedSql === formatted) return prev;
        const entry: HistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          language: lang,
          inputSql: rawInput,
          formattedSql: formatted,
        };
        return [entry, ...prev].slice(0, 20);
      });
    },
    []
  );

  // Auto-format whenever input or config changes if autoFormat is active
  useEffect(() => {
    if (!config.autoFormat) return;
    setIsMinified(false);
    const res = runSqlFormat(inputSql, config);
    setOutputSql(res.output);
    setFormatError(res.error);
  }, [inputSql, config]);

  const handleManualFormat = useCallback(() => {
    setIsMinified(false);
    const res = runSqlFormat(inputSql, config);
    setOutputSql(res.output);
    setFormatError(res.error);
    if (!res.error && res.output) {
      saveToHistory(inputSql, res.output, config.language);
    }
    setActiveTab('editor');
  }, [inputSql, config, saveToHistory]);

  const handleMinify = () => {
    if (!inputSql.trim()) return;
    const minified = minifySql(inputSql);
    setOutputSql(minified);
    setFormatError(null);
    setIsMinified(true);
  };

  const handleCopyOutput = async () => {
    if (!outputSql) return;
    try {
      await navigator.clipboard.writeText(outputSql);
      setCopied(true);
      saveToHistory(inputSql, outputSql, config.language);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handlePasteInput = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputSql(text);
        if (!config.autoFormat) {
          const res = runSqlFormat(text, config);
          setOutputSql(res.output);
          setFormatError(res.error);
        }
        setPasteNotice('Вставлено');
        setTimeout(() => setPasteNotice(null), 1500);
      }
    } catch {
      setPasteNotice('Скористайтеся Ctrl+V');
      setTimeout(() => setPasteNotice(null), 2200);
    }
  };

  const handleClear = () => {
    setInputSql('');
    setOutputSql('');
    setFormatError(null);
    setIsMinified(false);
    setShowDiff(false);
  };

  const handleCyclePreset = () => {
    const nextIdx = (presetIndex + 1) % SQL_PRESETS.length;
    const preset = SQL_PRESETS[nextIdx];
    setPresetIndex(nextIdx);
    setConfig((prev) => ({ ...prev, language: preset.dialect }));
    setInputSql(preset.query);
    setIsMinified(false);
    if (!config.autoFormat) {
      const res = runSqlFormat(preset.query, {
        ...config,
        language: preset.dialect,
      });
      setOutputSql(res.output);
      setFormatError(res.error);
    }
  };

  const handleLoadPreset = (preset: SqlPreset) => {
    const nextConfig = { ...config, language: preset.dialect };
    setConfig(nextConfig);
    setInputSql(preset.query);
    setIsMinified(false);
    const res = runSqlFormat(preset.query, nextConfig);
    setOutputSql(res.output);
    setFormatError(res.error);
    setActiveTab('editor');
  };

  const handleDownloadSql = () => {
    if (!outputSql) return;
    const blob = new Blob([outputSql], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formatted-${config.language}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setInputSql(content);
    if (!config.autoFormat) {
      const res = runSqlFormat(content, config);
      setOutputSql(res.output);
      setFormatError(res.error);
    }
    e.target.value = '';
  };

  const inputMetrics = useMemo(() => getTextMetrics(inputSql), [inputSql]);
  const displayedOutputSql = formatError ? inputSql : outputSql;
  const outputMetrics = useMemo(
    () => getTextMetrics(displayedOutputSql),
    [displayedOutputSql]
  );
  const validationErrors = useMemo(
    () =>
      config.syntaxCheck || formatError
        ? validateSqlSyntax(inputSql, config.language)
        : [],
    [config.syntaxCheck, config.language, formatError, inputSql]
  );
  const outputValidationErrors = useMemo(() => {
    if (!displayedOutputSql.trim()) return [];
    if (!config.syntaxCheck && !formatError) return [];
    if (formatError || displayedOutputSql === inputSql) {
      return validationErrors;
    }
    return validateSqlSyntax(displayedOutputSql, config.language);
  }, [
    config.language,
    config.syntaxCheck,
    displayedOutputSql,
    formatError,
    inputSql,
    validationErrors,
  ]);

  const dialectLabel = useMemo(
    () =>
      SQL_DIALECTS.find((d) => d.value === config.language)?.label ??
      config.language,
    [config.language]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (Concise Nav Links) — Zone 3 (Primary CTA) */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('editor');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            SQL Форматер
          </a>

          <nav
            aria-label="Основна навігація"
            className="flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'editor'
                  ? 'border-blue-600 text-slate-900 dark:border-sky-400 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Редактор
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'presets'
                  ? 'border-blue-600 text-slate-900 dark:border-sky-400 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Приклади
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'history'
                  ? 'border-blue-600 text-slate-900 dark:border-sky-400 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Історія ({history.length})
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleManualFormat}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Форматувати</span>
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'editor' && (
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-5 sm:px-6">
          {/* Page Intro & Workspace Toolbar */}
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 text-balance sm:text-2xl dark:text-white">
                Форматування та структурування SQL-запитів
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Вставте SQL-код ліворуч або перетягніть <code className="font-mono text-xs">.sql</code> файл — результат одразу з’явиться праворуч.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Ctrl/Cmd + Enter</span>
              <span aria-hidden="true">·</span>
              <span>{dialectLabel}</span>
              <button
                type="button"
                onClick={() => setIsDark((d) => !d)}
                aria-label={isDark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                {isDark ? (
                  <>
                    <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Світла тема</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Темна тема</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Formatting Configuration Bar */}
          <section
            aria-label="Параметри форматування"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <label
                htmlFor="dialect-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Діалект
              </label>
              <select
                id="dialect-select"
                value={config.language}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    language: e.target.value as SqlLanguage,
                  }))
                }
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {SQL_DIALECTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="keyword-case-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Регістр слів
              </label>
              <select
                id="keyword-case-select"
                value={config.keywordCase}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    keywordCase: e.target.value as KeywordCase,
                  }))
                }
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="upper">ВЕРХНІЙ (SELECT)</option>
                <option value="lower">нижній (select)</option>
                <option value="preserve">Зберегти оригінал</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="indent-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Відступ
              </label>
              <select
                id="indent-select"
                value={config.indentType}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    indentType: e.target.value as FormatConfig['indentType'],
                  }))
                }
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="2spaces">2 пробіли</option>
                <option value="4spaces">4 пробіли</option>
                <option value="tab">Табуляція (Tab)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="indent-style-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                Вирівнювання
              </label>
              <select
                id="indent-style-select"
                value={config.indentStyle}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    indentStyle: e.target.value as IndentStyle,
                  }))
                }
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="standard">Стандартне</option>
                <option value="tabularLeft">Табличне ліворуч</option>
                <option value="tabularRight">Табличне праворуч</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="operator-newline-select"
                className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
              >
                AND / OR
              </label>
              <select
                id="operator-newline-select"
                value={config.logicalOperatorNewline}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    logicalOperatorNewline: e.target
                      .value as LogicalOperatorNewline,
                  }))
                }
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="before">З нового рядка перед</option>
                <option value="after">Перенос після</option>
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    syntaxCheck: !prev.syntaxCheck,
                  }))
                }
                aria-pressed={config.syntaxCheck}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  config.syntaxCheck
                    ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/80 dark:border-sky-800/80 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Перевірка синтаксису</span>
              </button>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={config.autoFormat}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      autoFormat: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <span>Автоформатування</span>
              </label>

              <button
                type="button"
                onClick={handleMinify}
                disabled={!inputSql.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Мініфікувати</span>
              </button>

              <button
                type="button"
                onClick={() => setConfig(DEFAULT_CONFIG)}
                title="Скинути налаштування"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Скинути</span>
              </button>
            </div>
          </section>

          {/* Split Dual-Pane SQL Workbench */}
          <section
            aria-label="Робоча область форматування"
            className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2 items-stretch"
          >
            {/* Input Pane */}
            <div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:min-h-[600px] dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    Вхідний SQL
                  </h2>
                  <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400 whitespace-nowrap">
                    {inputMetrics.lines} ряд. · {inputMetrics.chars} симв.
                  </span>
                  {config.syntaxCheck && inputSql.trim() && (
                    validationErrors.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 tabular-nums dark:text-red-400 whitespace-nowrap">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {validationErrors.length}{' '}
                          {validationErrors.length === 1 ? 'помилка' : 'помилок'}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Синтаксис вірний</span>
                      </span>
                    )
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sql,.txt,text/plain"
                    onChange={handleUploadFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Завантажити .sql файл"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Файл</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePasteInput}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pasteNotice ?? 'Вставити'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCyclePreset}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    <span>Приклад</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!inputSql}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-red-950/40 dark:hover:text-red-300 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Очистити</span>
                  </button>
                </div>
              </div>

              <SqlEditor
                value={inputSql}
                onChange={setInputSql}
                onFormatShortcut={handleManualFormat}
                errors={validationErrors}
                syntaxCheckEnabled={config.syntaxCheck}
                jumpTarget={jumpTarget}
                placeholder="Вставте сюди ваш SQL-запит (наприклад: select id, name from users where active = 1)..."
              />

              {config.syntaxCheck && validationErrors.length > 0 && (
                <div
                  role="region"
                  aria-label="Виявлені синтаксичні помилки"
                  className="max-h-40 overflow-y-auto border-t border-red-200 bg-red-50/75 px-4 py-2.5 dark:border-red-900/50 dark:bg-red-950/35"
                >
                  <ul className="divide-y divide-red-200/70 dark:divide-red-900/40">
                    {validationErrors.map((err) => (
                      <li key={err.id} className="py-1.5 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() =>
                            setJumpTarget((prev) => ({
                              offset: err.startOffset,
                              seq: (prev?.seq ?? 0) + 1,
                            }))
                          }
                          className="flex w-full items-start gap-2.5 rounded text-left text-xs transition-colors hover:bg-red-100/70 focus-visible:outline-2 focus-visible:outline-red-600 dark:hover:bg-red-900/30"
                        >
                          <AlertCircle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-mono font-semibold text-red-700 tabular-nums dark:text-red-300">
                                Ряд. {err.line}, поз. {err.column}
                              </span>
                              <span className="font-medium text-red-900 dark:text-red-100">
                                {err.message}
                              </span>
                            </div>
                            {err.hint && (
                              <p className="mt-0.5 text-red-700/90 dark:text-red-300/90">
                                {err.hint}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Output Pane */}
            <div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:min-h-[600px] dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {formatError
                      ? 'Невідформатований SQL'
                      : isMinified
                        ? 'Мініфікований SQL'
                        : 'Відформатований результат'}
                  </h2>
                  {displayedOutputSql && (
                    <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400 whitespace-nowrap">
                      {outputMetrics.lines} ряд. · {outputMetrics.chars} симв. ·{' '}
                      {outputMetrics.statements}{' '}
                      {outputMetrics.statements === 1 ? 'запит' : 'запитів'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowDiff((d) => !d)}
                    disabled={!outputSql || Boolean(formatError)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 ${
                      showDiff
                        ? 'bg-blue-50 text-blue-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Порівняти</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSql}
                    disabled={!outputSql || Boolean(formatError)}
                    title="Завантажити як .sql"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>.sql</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    disabled={!outputSql || Boolean(formatError)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 ${
                      copied
                        ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                        : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Скопійовано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Копіювати</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <SqlCodeView
                formattedSql={outputSql}
                rawSql={inputSql}
                hasFormatError={Boolean(formatError)}
                showDiff={showDiff}
                onLoadSample={handleCyclePreset}
                validationErrors={outputValidationErrors}
                syntaxCheckEnabled={config.syntaxCheck}
              />
            </div>
          </section>
        </main>
      )}

      {activeTab === 'presets' && (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Приклади SQL-запитів
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Оберіть готовий шаблон, щоб перевірити форматування для різних SQL-діалектів.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SQL_PRESETS.map((preset) => {
              const dialectName =
                SQL_DIALECTS.find((d) => d.value === preset.dialect)?.label ??
                preset.dialect;
              return (
                <article
                  key={preset.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                        {preset.title}
                      </h2>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                        {dialectName}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {preset.description}
                    </p>
                    <pre className="mt-4 max-h-36 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      {preset.query}
                    </pre>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap shrink-0"
                    >
                      <span>Відкрити в редакторі</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      )}

      {activeTab === 'history' && (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Історія форматувань
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Запити зберігаються локально у вашому браузері після натискання «Форматувати» або «Копіювати».
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Очистити історію</span>
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Історія поки що порожня
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Відформатуйте запит у редакторі та натисніть «Форматувати» або «Копіювати», щоб зберегти його тут.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className="mt-4 inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                Перейти до редактора
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {history.map((item) => {
                const dialectName =
                  SQL_DIALECTS.find((d) => d.value === item.language)?.label ??
                  item.language;
                const formattedDate = new Date(item.createdAt).toLocaleString(
                  'uk-UA',
                  {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                );
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {dialectName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formattedDate}</span>
                      </div>
                      <pre className="mt-2 max-h-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                        {item.formattedSql}
                      </pre>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 sm:pt-6">
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            language: item.language,
                          }));
                          setInputSql(item.inputSql);
                          setOutputSql(item.formattedSql);
                          setFormatError(null);
                          setActiveTab('editor');
                        }}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                      >
                        Завантажити
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setHistory((prev) =>
                            prev.filter((entry) => entry.id !== item.id)
                          )
                        }
                        aria-label="Видалити запис"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
