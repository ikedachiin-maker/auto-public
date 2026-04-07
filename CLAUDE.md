# CLAUDE.md — Auto Public プロジェクト指示書

## プロジェクト概要

テーマを入力するだけで、電子書籍の自動生成からAmazon KDPアップロードまでを一気通貫で行うWebダッシュボード。

## 技術スタック・ルール

- **フレームワーク**: Next.js 16（App Router）で実装すること
- **スタイリング**: Tailwind CSS v4 を使用。ダークテーマ基調
- **AI API**: Claude API（`@anthropic-ai/sdk`）を使用。モデルは `claude-sonnet-4-5`
- **ブラウザ自動化**: Playwright を使用
- **EPUB生成**: `epub-gen-memory`（JSライブラリ）を使用。Vercel環境でも動作可能
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

## 電子書籍制作ワークフロー（必須手順）

電子書籍を制作する際は、以下の手順を必ず順番に実行すること。

### ステップ0: リサーチ（/omega-research）

- テーマが入力されたら、まず `/omega-research` スキルでリサーチを実行する
- 市場動向、競合書籍、ターゲット読者のニーズ、トレンド、具体的なデータや事例を収集する
- このリサーチ結果を、以降のすべてのステップ（タイトル生成・章立て・本文執筆）の基盤として活用する

### ステップ1: タイトル生成（/taiyo-style-headline）

- `/taiyo-style-headline` スキルを使って、リサーチ結果を踏まえてタイトル候補を **10個** 生成する
- テーマとターゲット読者を明確に指定してタイトルを生成すること

### ステップ2: タイトルのスコアリング（/taiyo-analyzer）

- `/taiyo-analyzer` スキルを使って、生成した10個のタイトルをスコアリングする
- **最も訴求力が高いタイトルを採用する**

### ステップ3: 章立て（全7章）のテーマ作成

- 採用したタイトルに沿って、全7章の各章テーマを作成する
- 構成:
  - 第1章〜第6章: 本編コンテンツ
  - 第7章: **LINE登録を促す内容**（書籍制作の最大目的はLINE登録）

### ステップ4: 章テーマのスコアリング（/taiyo-analyzer）

- `/taiyo-analyzer` スキルを使って、各章のテーマをスコアリングする
- **最も訴求力が高いテーマを各章に採用する**

### ステップ5: 本文執筆（/taiyo-style-sales-letter）

- `/taiyo-style-sales-letter` スキルを使って各章の本文を執筆する
- **各章 3,000文字程度**（全7章で合計約21,000文字の一冊）
- 第7章は特に重要:
  - 章全体を通してLINE登録を促す内容にすること
  - 第7章の最後に、LINE登録への明確なCTA（行動喚起）を入れること

### ステップ6: EPUB生成

- `epub-gen-memory` で全章をEPUBに変換
- 生成データは `research/runs/{timestamp}__{slug}/ebook/` に保存
- Vercel環境では `/tmp` に書き込み、生成後にブラウザへbase64で送信しダウンロード可能にする

### ステップ7: 設定更新

- `scripts/kdp-uploader/book-config.json` を自動更新

### 使用スキルまとめ

| ステップ | 使用スキル | 目的 |
|----------|-----------|------|
| リサーチ | `/omega-research` | テーマの市場調査・競合分析・データ収集（最初に必ず実行） |
| タイトル生成 | `/taiyo-style-headline` | リサーチを踏まえて売れるタイトル候補を10個出す |
| タイトル選定 | `/taiyo-analyzer` | スコアリングで最高のタイトルを選ぶ |
| 章テーマ選定 | `/taiyo-analyzer` | スコアリングで最高の章テーマを選ぶ |
| 本文執筆 | `/taiyo-style-sales-letter` | 訴求力のある本文を各章3,000文字で書く |

### 書籍制作の最重要目的

**LINE登録を獲得すること。** 書籍全体を通して価値提供しつつ、第7章で自然にLINE登録へ誘導する構成にすること。

## 書籍生成API パイプライン（技術仕様）

APIルート `src/app/api/ebook/generate/route.ts` で実行。SSEでフロントにリアルタイム配信。

1. **リサーチ** — Claude でテーマの市場調査
2. **アウトライン** — JSON形式で章構成を生成（title, subtitle, description, keywords, chapters）
3. **執筆** — 各章3,000文字程度。全7章。`research/runs/{timestamp}__{slug}/ebook/` に保存
4. **EPUB生成** — `epub-gen-memory` で全章をEPUBに変換。完了時にbase64でフロントへ送信
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
