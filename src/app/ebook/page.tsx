'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── 型定義 ────────────────────────────────────────────────────────────────

type StepKey = 'research' | 'outline' | 'writing' | 'epub' | 'done';
type StepStatus = 'idle' | 'running' | 'completed' | 'error';

interface StepState {
  status: StepStatus;
  message: string;
}

interface SseEvent {
  step: string;
  status: string;
  message: string;
  chapter?: number;
  total?: number;
  outputDir?: string;
  epubPath?: string;
  coverPath?: string;
  title?: string;
}

interface FormValues {
  theme: string;
  targetAudience: string;
  chapterCount: number;
  authorName: string;
  price: string;
}

// ─── 定数 ──────────────────────────────────────────────────────────────────

const STEP_ORDER: StepKey[] = ['research', 'outline', 'writing', 'epub', 'done'];

const STEP_LABELS: Record<StepKey, string> = {
  research: 'リサーチ',
  outline: 'アウトライン',
  writing: '執筆',
  epub: 'EPUB生成',
  done: '完了',
};

const INITIAL_STEPS: Record<StepKey, StepState> = {
  research: { status: 'idle', message: '' },
  outline: { status: 'idle', message: '' },
  writing: { status: 'idle', message: '' },
  epub: { status: 'idle', message: '' },
  done: { status: 'idle', message: '' },
};

// ─── アイコン ───────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'completed') {
    return (
      <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'running') {
    return (
      <svg className="w-5 h-5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  );
}

const STEP_BG: Record<StepStatus, string> = {
  idle: 'bg-gray-700 border-gray-600',
  running: 'bg-yellow-900/40 border-yellow-600',
  completed: 'bg-green-900/40 border-green-600',
  error: 'bg-red-900/40 border-red-600',
};

const STEP_TEXT: Record<StepStatus, string> = {
  idle: 'text-gray-400',
  running: 'text-yellow-300',
  completed: 'text-green-300',
  error: 'text-red-300',
};

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function EbookPage() {
  const router = useRouter();
  const logEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<FormValues>({
    theme: '',
    targetAudience: '',
    chapterCount: 10,
    authorName: '',
    price: '2980',
  });

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(INITIAL_STEPS);
  const [logs, setLogs] = useState<string[]>([]);
  const [writingProgress, setWritingProgress] = useState<{ chapter: number; total: number } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [resultTitle, setResultTitle] = useState('');

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const setStepState = (key: StepKey, state: Partial<StepState>) => {
    setSteps((prev) => ({ ...prev, [key]: { ...prev[key], ...state } }));
  };

  const handleFieldChange = (field: keyof FormValues, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (running) return;
    if (!form.theme.trim() || !form.targetAudience.trim() || !form.authorName.trim()) {
      alert('テーマ、ターゲット読者、著者名を入力してください');
      return;
    }

    setRunning(true);
    setCompleted(false);
    setSteps(INITIAL_STEPS);
    setLogs([]);
    setWritingProgress(null);
    setResultTitle('');

    try {
      const res = await fetch('/api/ebook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok || !res.body) {
        appendLog(`HTTPエラー: ${res.status}`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const line = part.slice('data: '.length);

          if (line === '[DONE]') {
            setRunning(false);
            return;
          }

          let event: SseEvent;
          try {
            event = JSON.parse(line);
          } catch {
            appendLog(line);
            continue;
          }

          const key = event.step as StepKey;

          if (event.step === 'error') {
            appendLog(`[ERROR] ${event.message}`);
            // mark all running steps as error
            setSteps((prev) => {
              const next = { ...prev };
              for (const k of STEP_ORDER) {
                if (next[k].status === 'running') {
                  next[k] = { ...next[k], status: 'error' };
                }
              }
              return next;
            });
            setRunning(false);
            continue;
          }

          if (STEP_ORDER.includes(key)) {
            const status = event.status === 'completed' ? 'completed' : event.status === 'error' ? 'error' : 'running';
            setStepState(key, { status: status as StepStatus, message: event.message });
          }

          if (event.step === 'writing' && event.chapter !== undefined && event.total !== undefined) {
            setWritingProgress({ chapter: event.chapter, total: event.total });
          }

          if (event.step === 'done' && event.status === 'completed') {
            setCompleted(true);
            if (event.title) setResultTitle(event.title);
          }

          appendLog(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`[ERROR] ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">電子書籍 自動生成</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              テーマを入力するだけでリサーチ・執筆・EPUB生成を自動実行
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </svg>
            ホーム
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ─── 左カラム: 入力フォーム ─────────────────────────────────── */}
          <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-5 pb-3 border-b border-gray-700">
              書籍の設定
            </h2>

            <div className="space-y-5">
              {/* テーマ */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  テーマ <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.theme}
                  onChange={(e) => handleFieldChange('theme', e.target.value)}
                  placeholder="例: インスタグラム認知広告"
                  disabled={running}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              {/* ターゲット読者 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  ターゲット読者 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.targetAudience}
                  onChange={(e) => handleFieldChange('targetAudience', e.target.value)}
                  placeholder="例: 中小企業の経営者・マーケター"
                  disabled={running}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              {/* 著者名 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  著者名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.authorName}
                  onChange={(e) => handleFieldChange('authorName', e.target.value)}
                  placeholder="例: 山田 太郎"
                  disabled={running}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              {/* 章数と価格 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">章数</label>
                  <select
                    value={form.chapterCount}
                    onChange={(e) => handleFieldChange('chapterCount', Number(e.target.value))}
                    disabled={running}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 5).map((n) => (
                      <option key={n} value={n}>
                        {n}章
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    価格（円）
                  </label>
                  <input
                    type="text"
                    value={form.price}
                    onChange={(e) => handleFieldChange('price', e.target.value)}
                    placeholder="2980"
                    disabled={running}
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>
              </div>

              {/* 生成開始ボタン */}
              <div className="pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={running}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-lg tracking-wide transition-all duration-150 shadow-lg
                    ${running
                      ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white hover:shadow-blue-900/40 hover:shadow-xl'
                    }`}
                >
                  {running ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      生成中...
                    </span>
                  ) : (
                    '生成開始'
                  )}
                </button>
              </div>

              {/* 注意書き */}
              <div className="p-3 bg-gray-800/60 border border-gray-700 rounded-lg">
                <p className="text-xs text-gray-400 leading-relaxed">
                  生成には章数に応じて 5〜20 分程度かかります。
                  リサーチ・アウトライン・各章の執筆・EPUB組版を自動実行します。
                  完了後は KDP アップロードページへ進めます。
                </p>
              </div>
            </div>
          </section>

          {/* ─── 右カラム: 進捗・ログ ───────────────────────────────────── */}
          <section className="flex flex-col gap-4">

            {/* ステップ進捗バー */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 shadow-xl">
              <h2 className="text-base font-semibold text-white mb-4 pb-3 border-b border-gray-700">
                パイプライン進捗
              </h2>

              <div className="space-y-2">
                {STEP_ORDER.map((key, idx) => {
                  const step = steps[key];
                  return (
                    <div key={key}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${STEP_BG[step.status]}`}
                      >
                        <StepIcon status={step.status} />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${STEP_TEXT[step.status]}`}>
                            {STEP_LABELS[key]}
                          </span>
                          {step.message && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{step.message}</p>
                          )}
                          {/* 執筆の場合にプログレスバーを表示 */}
                          {key === 'writing' && writingProgress && step.status === 'running' && (
                            <div className="mt-1.5">
                              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                                <span>第{writingProgress.chapter}章 / 全{writingProgress.total}章</span>
                                <span>{Math.round((writingProgress.chapter / writingProgress.total) * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div
                                  className="bg-yellow-500 h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${(writingProgress.chapter / writingProgress.total) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        {idx < STEP_ORDER.length - 1 && (
                          <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 完了時: KDPアップロードボタン */}
              {completed && (
                <div className="mt-4 p-4 bg-green-900/30 border border-green-700 rounded-lg">
                  <p className="text-sm text-green-300 font-medium mb-1">生成完了</p>
                  {resultTitle && (
                    <p className="text-xs text-gray-300 mb-3">「{resultTitle}」</p>
                  )}
                  <button
                    onClick={() => router.push('/kdp')}
                    className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold rounded-lg transition-all duration-150 shadow-md flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    KDP アップロードへ進む
                  </button>
                </div>
              )}
            </div>

            {/* リアルタイムログ */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 shadow-xl flex-1">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700">
                <h2 className="text-base font-semibold text-white">実行ログ</h2>
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    クリア
                  </button>
                )}
              </div>

              <div className="bg-black rounded-lg p-4 h-72 overflow-y-auto font-mono text-xs border border-gray-800">
                {logs.length === 0 ? (
                  <p className="text-gray-600 select-none">ログがここに表示されます...</p>
                ) : (
                  <div className="space-y-0.5">
                    {logs.map((line, idx) => {
                      const isError = line.startsWith('[ERROR]') || line.includes('エラー');
                      const isSuccess = line.includes('完了') || line.includes('成功');
                      return (
                        <div
                          key={idx}
                          className={`leading-relaxed whitespace-pre-wrap break-all ${
                            isError ? 'text-red-400' : isSuccess ? 'text-green-400' : 'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-600 mr-2 select-none">{String(idx + 1).padStart(3, '0')}</span>
                          {line}
                        </div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-2 text-right">{logs.length} 行</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
