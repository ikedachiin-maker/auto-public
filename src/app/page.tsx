import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <h1 className="text-3xl font-bold tracking-tight text-white">Auto Public</h1>
          <p className="text-gray-400 text-sm mt-1">電子書籍の自動生成からKDP出版まで一気通貫</p>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="max-w-xl mx-auto text-center">
          <div className="p-3 bg-gray-800 rounded-xl inline-block mb-6">
            <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-gray-200 mb-3">電子書籍 自動生成 & KDPアップロード</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            テーマを入力するだけで、AIがリサーチ・執筆・EPUB生成・KDPアップロードまで全自動で実行します。
          </p>

          <Link
            href="/ebook"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-150 shadow-lg hover:shadow-blue-900/40 hover:shadow-xl active:scale-95"
          >
            開始する
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* パイプライン説明 */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4 text-center">
            一気通貫パイプライン
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap justify-center">
            {['テーマ入力', 'AI リサーチ', 'アウトライン生成', '章ごとの執筆', 'EPUB生成', 'KDP アップロード'].map(
              (step, idx, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300">
                    {step}
                  </span>
                  {idx < arr.length - 1 && (
                    <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </span>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
