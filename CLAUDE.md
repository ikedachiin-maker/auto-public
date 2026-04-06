# CLAUDE.md — Auto Public プロジェクト指示書

## プロジェクト概要

テーマを入力するだけで、電子書籍の自動生成からAmazon KDPアップロードまでを一気通貫で行うWebダッシュボード。

## 技術スタック・ルール

- **フレームワーク**: Next.js 16（App Router）で実装すること
- **スタイリング**: Tailwind CSS v4 を使用。ダークテーマ基調
- **AI API**: Claude API（`@anthropic-ai/sdk`）を使用。モデルは `claude-sonnet-4-5`
- **ブラウザ自動化**: Playwright を使用
- **EPUB生成**: Pandoc（`/opt/homebrew/bin/pandoc`）を使用。SVG→PNG変換は rsvg-convert → ImageMagick → Python の順でフォールバック
- **言語**: UIもコードコメントも日本語
- **Node.js**: 18以上必須

## ディレクトリ構成

```
src/app/
  page.tsx              — トップページ（/ebook と /kdp へのナビ）
  layout.tsx            — ルートレイアウト（lang=ja）
  ebook/page.tsx        — 電子書籍生成ダッシュボード
  kdp/page.tsx          — KDPアップロードダッシュボード
  kdp/layout.tsx        — KDPセクションのレイアウト
  api/ebook/generate/route.ts — 書籍生成API（SSEストリーミング）
  api/kdp/config/route.ts     — 書籍メタデータ設定API（GET/POST）
  api/kdp/upload/route.ts     — KDPアップロード実行API（子プロセス起動→SSE）

scripts/kdp-uploader/
  kdp-upload.js         — KDP自動アップロード（7ステップ）
  human-like.js         — 人間らしい操作ユーティリティ
  book-config.json      — 書籍メタデータ設定ファイル

research/runs/          — 生成された書籍データの保存先
```

## 書籍生成パイプライン（5フェーズ）

APIルート `src/app/api/ebook/generate/route.ts` で実行。SSEでフロントにリアルタイム配信。

1. **リサーチ** — Claude でテーマの市場調査
2. **アウトライン** — JSON形式で章構成を生成（title, subtitle, description, keywords, chapters）
3. **執筆** — 各章5000〜8000字。はじめに＋指定章数。`research/runs/{timestamp}__{slug}/ebook/` に保存
4. **EPUB生成** — 全章をcombined.md → Pandoc → EPUB。カバー画像はSVGから自動生成
5. **設定更新** — `scripts/kdp-uploader/book-config.json` を自動更新

## KDPアップロード（7ステップ）

`scripts/kdp-uploader/kdp-upload.js` で実行。

1. ブラウザ起動（persistent context、`.browser-profile/` にセッション保持）
2. ログイン判定＆実行（2FA は手動対応、最大5分待機）
3. 新しい電子書籍の作成開始
4. 書籍詳細入力（タイトル・著者・説明・キーワード）
5. 原稿EPUBアップロード
6. 表紙画像アップロード
7. 下書き保存（**最終公開は絶対に自動で行わないこと**）

## 重要なルール

### 必ず守ること
- KDPの**最終公開（出版）は絶対に自動化しない**。下書き保存まで
- KDP操作は必ず `human-like.js` の関数を経由すること（humanType, humanClick, humanDelay 等）
- 深夜帯（0:00〜7:59）はKDP操作を実行しない（`isReasonableHour()` で制御）
- AI生成コンテンツであることの開示（aiDisclosure）を必ず設定する
- 環境変数（`KDP_EMAIL`, `KDP_PASSWORD`, `ANTHROPIC_API_KEY`）をコードにハードコードしない

### コーディング規約
- APIルートは SSE（Server-Sent Events）でフロントにストリーミング配信する
- KDPのUI変更に対応するため、セレクタは複数候補をフォールバックで試す
- エラー時はスクリーンショットを `scripts/kdp-uploader/screenshots/` に保存する
- 生成データは `research/runs/{timestamp}__{slug}/` 配下に整理する

### リサーチ
- リサーチを行う際は `/omega-research` スキルを使用すること

## 環境変数

| 変数名 | 場所 | 用途 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | `.env.local` | Claude API |
| `KDP_EMAIL` | `.env` | Amazon KDPログイン |
| `KDP_PASSWORD` | `.env` | Amazon KDPログイン |

## 開発コマンド

```bash
npm run dev    # 開発サーバー起動（http://localhost:3000）
npm run build  # プロダクションビルド
npm run lint   # ESLint実行
```

## 注意事項

- KDP公式APIは存在しない。ブラウザ自動化はグレーゾーンでありアカウントBANリスクがある
- `package.json` の name が `meta-ads-automation` のままになっている（要修正）
