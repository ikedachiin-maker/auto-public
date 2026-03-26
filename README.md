# KDP Uploader — 人間らしい自動アップロード

## セットアップ

### 1. 環境変数を設定

`.env` に以下を追加:

```
KDP_EMAIL=your-amazon-email@example.com
KDP_PASSWORD=your-password
```

### 2. 実行

```bash
node scripts/kdp-uploader/kdp-upload.js
```

初回はブラウザが開き、2FA認証を手動で行う必要があります。
2回目以降はセッションが保持されます。

## ファイル構成

```
scripts/kdp-uploader/
├── kdp-upload.js      # メインスクリプト
├── human-like.js      # 人間らしい操作ユーティリティ
├── book-config.json   # 書籍メタデータ設定
├── README.md
├── .browser-profile/  # ブラウザセッション保存（自動生成）
└── screenshots/       # 各ステップのスクリーンショット（自動生成）
```

## 安全策

- **自動公開しない**: 下書き保存まで。最終公開は手動
- **時間帯制限**: 8:00-23:00のみ実行可能
- **操作の揺らぎ**: タイピング速度・クリック位置・待機時間がすべてランダム
- **スクリーンショット**: 各ステップで自動保存（エラー時も）
