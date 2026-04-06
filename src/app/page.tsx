import Link from 'next/link';

interface NavCard {
  href: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  gradient: string;
  icon: React.ReactNode;
}

const cards: NavCard[] = [
  {
    href: '/ebook',
    title: '電子書籍 自動生成',
    description:
      'テーマを入力するだけでAIがリサーチ・執筆・EPUBを自動生成。KDPへの出版準備まで一気通貫で実行します。',
    badge: 'AI 生成',
    badgeColor: 'bg-blue-600 text-white',
    gradient: 'from-blue-600/20 to-indigo-600/20',
    icon: (
      <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    href: '/kdp',
    title: 'KDP アップロード',
    description:
      'Amazon Kindle Direct Publishing へ書籍を自動アップロード。書籍設定の管理からブラウザ自動操作まで対応。',
    badge: 'KDP',
    badgeColor: 'bg-orange-600 text-white',
    gradient: 'from-orange-600/20 to-amber-600/20',
    icon: (
      <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <h1 className="text-3xl font-bold tracking-tight text-white">SNS Auto</h1>
          <p className="text-gray-400 text-sm mt-1">電子書籍の自動生成から KDP 出版まで</p>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="text-xl font-semibold text-gray-200 mb-2">ダッシュボード</h2>
          <p className="text-gray-500 text-sm">実行したいパイプラインを選択してください</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative bg-gradient-to-br ${card.gradient} bg-gray-900 border border-gray-800 rounded-2xl p-7 hover:border-gray-600 hover:shadow-2xl hover:shadow-gray-900/50 transition-all duration-200 active:scale-[0.98]`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-gray-800 rounded-xl">{card.icon}</div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${card.badgeColor}`}>
                  {card.badge}
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{card.description}</p>

              <div className="mt-5 flex items-center gap-1 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
                <span>開く</span>
                <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* パイプライン説明 */}
        <div className="mt-12 max-w-3xl mx-auto">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
            一気通貫パイプライン
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
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
