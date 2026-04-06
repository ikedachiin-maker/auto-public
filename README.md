# Auto Public — 電子書籍 自動生成 & KDPアップロード

テーマを入力するだけで、リサーチ → 執筆 → EPUB生成 → Amazon KDPアップロードまでを全自動で実行するWebダッシュボード。

## 機能

### 1. 電子書籍 自動生成 (`/ebook`)
- テーマ・ターゲット読者を入力
- Claude API でリサーチ → アウトライン → 各章執筆
- Pandoc で EPUB 自動生成
- 5〜15章構成、各章5000〜8000字

### 2. KDP アップロード (`/kdp`)
- 書籍メタデータ設定（タイトル・著者・価格・キーワード等）
- Playwright による自動ブラウザ操作
- 人間らしい操作エンジン（タイプミス再現、ランダム遅延、ベジェ曲線スクロール）
- 下書き保存まで自動、最終公開は手動

### 人間らしさエンジン（human-like.js）

| 関数 | 動作 |
|------|------|
| `humanDelay(min, max)` | 正規分布に基づくランダム待機 |
| `humanType(page, selector, text)` | 1文字ずつランダム速度で入力、3%でtypo→修正 |
| `humanClick(page, selector)` | 要素中心からランダムにずらしてクリック |
| `humanScroll(page, targetY)` | 段階的スクロール、15%で少し戻る |
| `sessionBreak()` | 大きな操作の区切りで5〜15秒の休憩 |
| `isReasonableHour()` | 深夜帯（0:00〜7:59）の実行を防止 |

## セットアップ

```bash
git clone https://github.com/ikedachiin-maker/auto-public.git
cd auto-public
npm install
npx playwright install chromium
```

### 環境変数

`.env.local` を作成（Claude API用）:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxx
```

KDPアップロード用の `.env` をプロジェクトルートに作成:

```
KDP_EMAIL=your-amazon-email@example.com
KDP_PASSWORD=your-password
```

### 必要な外部ツール

- Node.js 18+
- Pandoc（EPUB生成用）: `brew install pandoc`

## 使い方

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開く。

1. **「電子書籍 自動生成」** — テーマを入力して生成開始
2. **「KDP アップロード」** — 生成された書籍をKDPにアップロード

## プロジェクト構成

```
auto-public/
├── src/app/
│   ├── page.tsx              # トップページ（ナビゲーション）
│   ├── ebook/page.tsx        # 電子書籍生成ダッシュボード
│   ├── kdp/page.tsx          # KDPアップロードダッシュボード
│   └── api/
│       ├── ebook/generate/   # 書籍生成API（SSE）
│       └── kdp/              # KDP設定・アップロードAPI
├── scripts/kdp-uploader/
│   ├── kdp-upload.js         # KDP自動アップロード（7ステップ）
│   ├── human-like.js         # 人間らしい操作ユーティリティ
│   └── book-config.json      # 書籍メタデータ設定
├── research/runs/            # 生成された書籍データ
├── package.json
└── next.config.ts
```

## 技術スタック

- Next.js 16 (App Router)
- Tailwind CSS v4
- Claude API (`@anthropic-ai/sdk`)
- Playwright（ブラウザ自動化）
- Pandoc（EPUB生成）

## 注意事項

- KDP公式APIは存在しないため、ブラウザ自動化はグレーゾーンです
- アカウントBANのリスクがあります。利用は自己責任で
- 最終公開は必ず手動で確認してください
- AI生成コンテンツであることの開示が自動設定されます

## ライセンス

MIT
