'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'running' | 'done' | 'error';

interface BookConfig {
  title: string;
  subtitle: string;
  author: string;
  description: string;
  keywords: string[];
  manuscriptPath: string;
  coverPath: string;
  price: string;
  royaltyPlan: string;
  enableDRM?: boolean;
  language?: string;
  aiDisclosure?: boolean;
  aiDisclosureText?: string;
}

const defaultConfig: BookConfig = {
  title: '',
  subtitle: '',
  author: '',
  description: '',
  keywords: [],
  manuscriptPath: '',
  coverPath: '',
  price: '',
  royaltyPlan: '70',
};

const STATUS_LABEL: Record<Status, string> = {
  idle: '待機中',
  running: '実行中',
  done: '完了',
  error: 'エラー',
};

const STATUS_COLOR: Record<Status, string> = {
  idle: 'bg-gray-500',
  running: 'bg-yellow-500',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

export default function KdpPage() {
  const [config, setConfig] = useState<BookConfig>(defaultConfig);
  const [keywordsText, setKeywordsText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  // マウント時に設定を読み込む
  useEffect(() => {
    fetch('/api/kdp/config')
      .then((res) => res.json())
      .then((data: BookConfig) => {
        setConfig(data);
        setKeywordsText(Array.isArray(data.keywords) ? data.keywords.join(', ') : '');
      })
      .catch(() => {
        setLogs(['設定ファイルの読み込みに失敗しました。']);
      });
  }, []);

  // ログが追加されたら最下部へスクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleFieldChange = (
    field: keyof BookConfig,
    value: string | boolean
  ) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaveMessage('');
    setSaveError('');

    const payload: BookConfig = {
      ...config,
      keywords: keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    };

    try {
      const res = await fetch('/api/kdp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage('設定を保存しました');
        setConfig(payload);
      } else {
        setSaveError(data.error ?? '保存に失敗しました');
      }
    } catch {
      setSaveError('ネットワークエラーが発生しました');
    }
  };

  const handleUpload = async () => {
    if (status === 'running') return;

    setStatus('running');
    setLogs(['アップロードを開始します...']);

    try {
      const res = await fetch('/api/kdp/upload', { method: 'POST' });

      if (!res.ok || !res.body) {
        setStatus('error');
        setLogs((prev) => [...prev, `HTTPエラー: ${res.status}`]);
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
          if (part.startsWith('data: ')) {
            const line = part.slice('data: '.length);
            if (line === '[DONE]') {
              setStatus((prev) => (prev === 'running' ? 'done' : prev));
              return;
            }
            setLogs((prev) => [...prev, line]);

            if (line.startsWith('[ERROR]') || line.includes('❌')) {
              setStatus('error');
            }
          }
        }
      }

      setStatus((prev) => (prev === 'running' ? 'done' : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラー';
      setLogs((prev) => [...prev, `エラー: ${message}`]);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            KDP アップロードダッシュボード
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Amazon Kindle Direct Publishing への書籍アップロード管理
          </p>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 左カラム: 設定フォーム */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-5 pb-3 border-b border-gray-100">
              書籍設定
            </h2>

            <div className="space-y-4">
              {/* タイトル */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="書籍タイトルを入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* サブタイトル */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  サブタイトル
                </label>
                <input
                  type="text"
                  value={config.subtitle}
                  onChange={(e) => handleFieldChange('subtitle', e.target.value)}
                  placeholder="サブタイトルを入力（任意）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 著者名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  著者名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={config.author}
                  onChange={(e) => handleFieldChange('author', e.target.value)}
                  placeholder="著者名を入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 内容紹介 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  内容紹介
                </label>
                <textarea
                  value={config.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={5}
                  placeholder="書籍の内容紹介を入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                />
              </div>

              {/* キーワード */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  キーワード
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    （カンマ区切り、最大7個）
                  </span>
                </label>
                <input
                  type="text"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="キーワード1, キーワード2, キーワード3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {keywordsText && (
                  <p className="text-xs text-gray-500 mt-1">
                    {keywordsText.split(',').filter((k) => k.trim()).length} 個のキーワード
                  </p>
                )}
              </div>

              {/* 価格とロイヤリティ（横並び） */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    価格（円）
                  </label>
                  <input
                    type="text"
                    value={config.price}
                    onChange={(e) => handleFieldChange('price', e.target.value)}
                    placeholder="2980"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ロイヤリティ
                  </label>
                  <select
                    value={config.royaltyPlan}
                    onChange={(e) => handleFieldChange('royaltyPlan', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="35">35%</option>
                    <option value="70">70%</option>
                  </select>
                </div>
              </div>

              {/* 原稿パス */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  原稿パス
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    （プロジェクトルートからの相対パス）
                  </span>
                </label>
                <input
                  type="text"
                  value={config.manuscriptPath}
                  onChange={(e) => handleFieldChange('manuscriptPath', e.target.value)}
                  placeholder="research/runs/xxx/book.epub"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 表紙パス */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  表紙パス
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    （プロジェクトルートからの相対パス）
                  </span>
                </label>
                <input
                  type="text"
                  value={config.coverPath}
                  onChange={(e) => handleFieldChange('coverPath', e.target.value)}
                  placeholder="research/runs/xxx/cover.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 保存ボタン */}
              <div className="pt-2">
                <button
                  onClick={handleSave}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors duration-150"
                >
                  設定を保存
                </button>

                {saveMessage && (
                  <p className="mt-2 text-sm text-green-600 text-center">
                    {saveMessage}
                  </p>
                )}
                {saveError && (
                  <p className="mt-2 text-sm text-red-600 text-center">
                    {saveError}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 右カラム: 実行・ログ */}
          <section className="flex flex-col gap-4">

            {/* アップロードカード */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-3 border-b border-gray-100">
                アップロード実行
              </h2>

              {/* アップロードボタン */}
              <button
                onClick={handleUpload}
                disabled={status === 'running'}
                className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg tracking-wide transition-all duration-150 shadow-md
                  ${status === 'running'
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 hover:shadow-lg active:scale-95'
                  }`}
              >
                {status === 'running' ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    アップロード中...
                  </span>
                ) : (
                  'アップロード開始'
                )}
              </button>

              {/* ステータス表示 */}
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">ステータス:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-sm font-medium ${STATUS_COLOR[status]}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full bg-white ${status === 'running' ? 'animate-pulse' : ''}`}
                  />
                  {STATUS_LABEL[status]}
                </span>
              </div>

              {/* 注意事項 */}
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 leading-relaxed">
                  アップロードスクリプトが起動します。ブラウザが自動操作されます。
                  2FA認証が必要な場合はブラウザ画面で手動操作してください。
                  最終公開はKDP管理画面で手動で行ってください。
                </p>
              </div>
            </div>

            {/* ログエリア */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex-1">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">実行ログ</h2>
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    クリア
                  </button>
                )}
              </div>

              <div className="bg-gray-950 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500 select-none">
                    ログがここに表示されます...
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {logs.map((line, idx) => {
                      const isError =
                        line.startsWith('[ERROR]') ||
                        line.startsWith('[STDERR]') ||
                        line.includes('❌');
                      const isSuccess =
                        line.includes('✅') || line.includes('完了');
                      const isDone = line === '[DONE]' || line.startsWith('[EXIT]');

                      return (
                        <div
                          key={idx}
                          className={`leading-relaxed whitespace-pre-wrap break-all
                            ${isError ? 'text-red-400' : ''}
                            ${isSuccess ? 'text-green-400' : ''}
                            ${isDone ? 'text-blue-400' : ''}
                            ${!isError && !isSuccess && !isDone ? 'text-gray-200' : ''}
                          `}
                        >
                          {line}
                        </div>
                      );
                    })}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400 mt-2 text-right">
                {logs.length} 行
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
