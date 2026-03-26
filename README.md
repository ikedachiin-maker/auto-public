# Auto Public — KDP 電子書籍 自動アップロードツール

Playwright を使い、**人間が操作しているかのような自然なペース**で Amazon KDP（Kindle Direct Publishing）に電子書籍をアップロードするツールです。

---

## なぜこのツールが必要か

Amazon KDP には公式 API が存在しません（Amazon が明言）。そのため、電子書籍の出版は毎回ブラウザで手作業が必要です。

**Auto Public** は、この手作業を自動化しつつ、Bot 検知を回避するための「揺らぎ（人間らしさ）」を全操作に組み込んでいます。

---

## 他のツールとの違い

| 特徴 | Auto Public | Selenium 系スクリプト | KDP 手動操作 |
|------|------------|---------------------|-------------|
| **Bot 検知対策** | 正規分布ベースの揺らぎ、typo 挿入、ベジェ曲線スクロール | なし（機械的な一定速度） | 不要 |
| **タイピング** | 1文字50〜200msのランダム間隔 + 3%の確率でtypo→修正 | 一括入力 or 固定速度 | 手動 |
| **クリック** | 要素中心からランダムにずらした位置をクリック | 要素中心を正確にクリック | 手動 |
| **スクロール** | 段階的 + 15%の確率で少し戻る | 即座にスクロール | 手動 |
| **待機時間** | 正規分布（Box-Muller変換）ベース | `sleep(n)` 固定 | ― |
| **セッション保持** | Persistent Context（2FA を1回だけ通せばOK） | 毎回ログイン | 毎回ログイン |
| **自動公開** | しない（下書き保存まで） | ツールによる | 手動 |
| **スクリーンショット** | 全ステップ自動保存 | なし | なし |
| **時間帯制限** | 8:00〜23:00 のみ実行可能 | なし | ― |
| **所要時間** | 約3〜5分 | 約1分 | 約15分 |

---

## 機能一覧

### 7ステップの自動化フロー

```
Step 1: KDP にアクセス
Step 2: ログイン（2FA は初回のみ手動）
Step 3: 新しい電子書籍の作成を開始
Step 4: 書籍メタデータを入力（タイトル・著者・説明文・キーワード）
Step 5: 原稿ファイルをアップロード（EPUB）
Step 6: 表紙画像をアップロード（PNG）
Step 7: 下書きとして保存（自動公開はしない）
```

### 人間らしさエンジン（human-like.js）

| 関数 | 動作 |
|------|------|
| `humanDelay(min, max)` | 正規分布に基づくランダム待機 |
| `readingPause()` | ページ遷移後の「読んでいる」待機（1.5〜4秒） |
| `thinkingPause()` | 次のアクション前の「考えている」待機（0.3〜1.2秒） |
| `humanType(page, selector, text)` | 1文字ずつランダム速度で入力、3%でtypo→修正 |
| `humanClick(page, selector)` | 要素中心からランダムにずらしてクリック |
| `humanScroll(page, targetY)` | 段階的スクロール、15%で少し戻る |
| `scrollToElement(page, selector)` | 要素まで人間らしくスクロール |
| `humanFileUpload(page, selector, path)` | ファイル選択後にダイアログ操作風の待機 |
| `sessionBreak()` | 大きな操作の区切りで5〜15秒の休憩 |
| `isReasonableHour()` | 深夜帯（0:00〜7:59）の実行を防止 |

### 安全策

- **自動公開しない**: 下書き保存まで。最終公開は KDP 管理画面で手動確認
- **時間帯制限**: 8:00〜23:00 のみ実行可能（深夜の不自然なアクセスを回避）
- **Headful 実行**: ヘッドレスではなく実際のブラウザ画面を表示（目視確認可能）
- **スクリーンショット**: 各ステップで自動保存。エラー発生時も保存
- **webdriver 隠蔽**: `navigator.webdriver = false` を設定
- **ブラウザ指紋**: 通常の Chrome ユーザーエージェント・日本語ロケール・東京タイムゾーン

---

## セットアップ

### 必要環境

- Node.js 18 以上
- npm

### 1. インストール

```bash
git clone https://github.com/ikedachiin-maker/auto-public.git
cd auto-public
npm install playwright
npx playwright install chromium
```

### 2. 環境変数を設定

プロジェクトルートに `.env` ファイルを作成:

```
KDP_EMAIL=your-amazon-email@example.com
KDP_PASSWORD=your-password
```

### 3. 書籍メタデータを設定

`book-config.json` を編集:

```json
{
  "title": "書籍タイトル",
  "subtitle": "サブタイトル（任意）",
  "author": "著者名",
  "description": "内容紹介文（KDP の商品説明に表示）",
  "keywords": [
    "キーワード1",
    "キーワード2",
    "キーワード3"
  ],
  "manuscriptPath": "path/to/your-book.epub",
  "coverPath": "path/to/cover.png",
  "price": "2980",
  "royaltyPlan": "70",
  "enableDRM": false
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `title` | Yes | 書籍タイトル |
| `subtitle` | No | サブタイトル |
| `author` | Yes | 著者名 |
| `description` | Yes | 内容紹介文 |
| `keywords` | Yes | 検索キーワード（最大7個） |
| `manuscriptPath` | Yes | EPUB ファイルのパス |
| `coverPath` | Yes | 表紙画像のパス（PNG, 1600x2560px 推奨） |
| `price` | Yes | 販売価格（円） |
| `royaltyPlan` | No | ロイヤリティプラン（`"70"` or `"35"`） |
| `enableDRM` | No | DRM の有効/無効（デフォルト: `false`） |

### 4. 実行

```bash
node kdp-upload.js
```

別の設定ファイルを指定する場合:

```bash
node kdp-upload.js --config path/to/another-config.json
```

---

## 実行の流れ

```
$ node kdp-upload.js

🚀 KDP アップロード開始
   書籍: 月1万円で8,400人に届く ― まだ誰も書いていない"認知広告"という最安集客ルート
   著者: 合同会社アドマーケティング代表社員 池田宜史

📖 Step 1: KDPにアクセス...
🔐 Step 2: ログイン...
  ☕ 8.3秒の休憩...
📝 Step 3: 新しい電子書籍を作成...
  ☕ 12.1秒の休憩...
📋 Step 4: 書籍の詳細を入力...
  ☕ 7.6秒の休憩...
📄 Step 5: 原稿をアップロード...
   📁 原稿: /path/to/book.epub
   ⏳ アップロード処理中...
   ✅ 原稿アップロード完了
  ☕ 9.4秒の休憩...
🎨 Step 6: 表紙をアップロード...
   📁 表紙: /path/to/cover.png
   ⏳ 表紙処理中...
   ✅ 表紙アップロード完了
  ☕ 11.2秒の休憩...
💾 Step 7: 下書き保存...

✅ 完了！下書きとして保存されました。
   ⚠️  最終公開はKDP管理画面で手動で行ってください。
   📸 スクリーンショット: ./screenshots

🖥️  ブラウザは手動確認のため開いたままです。
   確認後、ブラウザを手動で閉じてください。
```

---

## ファイル構成

```
auto-public/
├── kdp-upload.js       # メインスクリプト（7ステップ自動化）
├── human-like.js       # 人間らしい操作ユーティリティ（揺らぎエンジン）
├── book-config.json    # 書籍メタデータ設定
├── README.md           # このファイル
├── .env                # 認証情報（自分で作成、git管理外）
├── .browser-profile/   # ブラウザセッション保存（自動生成）
└── screenshots/        # 各ステップのスクリーンショット（自動生成）
```

---

## 注意事項

- **KDP に公式 API は存在しません**。本ツールはブラウザ自動操作による非公式な手段です
- **KDP の規約上、ブラウザ自動化はグレーゾーン**です。利用は自己責任でお願いします
- **アカウント BAN のリスク**があります。揺らぎエンジンでリスクを低減していますが、完全に排除することはできません
- **1日1冊まで**の利用を推奨します
- **最終公開は必ず手動で行ってください**。内容を目視確認してから公開することを強く推奨します

---

## ライセンス

MIT
