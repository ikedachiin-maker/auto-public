/**
 * Phase 6: 表紙生成（Gemini + HTML/CSS + Playwright）
 * - Gemini APIで背景イラスト生成（テキストなし）
 * - HTML/CSSでタイトル・著者名を合成（Noto Sans JP）
 * - PlaywrightでPNG出力（1600x2560px）
 * - Vercel環境ではスキップ
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GeminiClient } from '../clients/gemini-client';
import type { SSEManager } from '../sse-manager';
import type { Outline, CoverResult } from '../types';

/**
 * 表紙用HTML/CSSテンプレートを生成
 * 背景画像はbase64でHTMLに埋め込む
 */
function buildCoverHTML(
  backgroundBase64: string,
  mimeType: string,
  title: string,
  subtitle: string,
  authorName: string
): string {
  // タイトルの文字数に応じてフォントサイズを自動調整
  let titleFontSize = '72px';
  if (title.length > 20) titleFontSize = '56px';
  if (title.length > 30) titleFontSize = '44px';
  if (title.length > 40) titleFontSize = '36px';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1600px;
      height: 2560px;
      overflow: hidden;
      font-family: 'Noto Sans JP', sans-serif;
    }
    .cover-container {
      position: relative;
      width: 1600px;
      height: 2560px;
      background-image: url('data:${mimeType};base64,${backgroundBase64}');
      background-size: cover;
      background-position: center;
    }
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0.6) 0%,
        rgba(0, 0, 0, 0.2) 35%,
        rgba(0, 0, 0, 0.1) 60%,
        rgba(0, 0, 0, 0.5) 100%
      );
    }
    .title-area {
      position: absolute;
      top: 200px;
      left: 100px;
      right: 100px;
      text-align: center;
    }
    .title {
      font-size: ${titleFontSize};
      font-weight: 900;
      color: #ffffff;
      text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.8);
      line-height: 1.3;
      letter-spacing: 0.05em;
    }
    .subtitle {
      margin-top: 40px;
      font-size: 36px;
      font-weight: 400;
      color: #e0e0e0;
      text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
      line-height: 1.5;
    }
    .author-area {
      position: absolute;
      bottom: 200px;
      left: 100px;
      right: 100px;
      text-align: center;
    }
    .author {
      font-size: 40px;
      font-weight: 700;
      color: #ffffff;
      text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
      letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <div class="cover-container">
    <div class="overlay"></div>
    <div class="title-area">
      <div class="title">${escapeHTML(title)}</div>
      <div class="subtitle">${escapeHTML(subtitle)}</div>
    </div>
    <div class="author-area">
      <div class="author">${escapeHTML(authorName)}</div>
    </div>
  </div>
</body>
</html>`;
}

/** HTMLエスケープ */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * デフォルトのグラデーション背景を生成するHTML
 * Gemini APIが失敗した場合のフォールバック
 */
function buildFallbackCoverHTML(
  title: string,
  subtitle: string,
  authorName: string
): string {
  let titleFontSize = '72px';
  if (title.length > 20) titleFontSize = '56px';
  if (title.length > 30) titleFontSize = '44px';
  if (title.length > 40) titleFontSize = '36px';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1600px;
      height: 2560px;
      overflow: hidden;
      font-family: 'Noto Sans JP', sans-serif;
    }
    .cover-container {
      position: relative;
      width: 1600px;
      height: 2560px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #533483 100%);
    }
    .decorative-circle {
      position: absolute;
      border-radius: 50%;
      opacity: 0.1;
    }
    .circle-1 { width: 800px; height: 800px; top: -200px; right: -200px; background: #e94560; }
    .circle-2 { width: 600px; height: 600px; bottom: 300px; left: -150px; background: #533483; }
    .circle-3 { width: 400px; height: 400px; top: 800px; right: 200px; background: #0f3460; }
    .title-area {
      position: absolute;
      top: 400px;
      left: 120px;
      right: 120px;
      text-align: center;
    }
    .title {
      font-size: ${titleFontSize};
      font-weight: 900;
      color: #ffffff;
      line-height: 1.3;
      letter-spacing: 0.05em;
    }
    .subtitle {
      margin-top: 50px;
      font-size: 36px;
      font-weight: 400;
      color: #b0b0b0;
      line-height: 1.5;
    }
    .divider {
      margin: 60px auto;
      width: 200px;
      height: 3px;
      background: linear-gradient(90deg, transparent, #e94560, transparent);
    }
    .author-area {
      position: absolute;
      bottom: 300px;
      left: 120px;
      right: 120px;
      text-align: center;
    }
    .author {
      font-size: 40px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <div class="cover-container">
    <div class="decorative-circle circle-1"></div>
    <div class="decorative-circle circle-2"></div>
    <div class="decorative-circle circle-3"></div>
    <div class="title-area">
      <div class="title">${escapeHTML(title)}</div>
      <div class="divider"></div>
      <div class="subtitle">${escapeHTML(subtitle)}</div>
    </div>
    <div class="author-area">
      <div class="author">${escapeHTML(authorName)}</div>
    </div>
  </div>
</body>
</html>`;
}

export async function executeCover(
  outline: Outline,
  authorName: string,
  theme: string,
  gemini: GeminiClient,
  sse: SSEManager,
  runDir: string
): Promise<CoverResult> {
  const coverPath = path.join(runDir, 'cover.jpeg');

  // Step 1: Gemini APIで背景画像生成
  sse.send({
    step: 'cover',
    status: 'running',
    message: '表紙背景画像を生成中...',
  });

  let coverHTML: string;

  try {
    const imageResult = await gemini.generateImage({
      prompt: `Create a professional book cover background image for a Japanese ebook about "${theme}".

Requirements:
- Abstract, professional design suitable for a business/self-help book
- NO text, NO letters, NO words, NO characters of any language
- Rich, sophisticated color palette
- Clean composition with space for title text overlay in the upper third
- High quality, print-ready resolution
- Modern, elegant aesthetic
- Keywords: ${outline.keywords.join(', ')}

Style: Professional, abstract, modern Japanese book cover background`,
    });

    const backgroundBase64 = imageResult.imageBuffer.toString('base64');
    coverHTML = buildCoverHTML(
      backgroundBase64,
      imageResult.mimeType,
      outline.title,
      outline.subtitle,
      authorName
    );
  } catch (err) {
    console.warn('[Cover] Gemini API失敗、フォールバック背景を使用:', err);
    sse.send({
      step: 'cover',
      status: 'running',
      message: '背景画像生成失敗、グラデーション背景で代替...',
    });
    coverHTML = buildFallbackCoverHTML(outline.title, outline.subtitle, authorName);
  }

  // Step 2: PlaywrightでPNG/JPEG出力
  sse.send({
    step: 'cover',
    status: 'running',
    message: 'タイトル・著者名をテキスト合成中...',
  });

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // viewportの設定（setViewportSizeを使用）
    await page.setViewportSize({ width: 1600, height: 2560 });
    await page.setContent(coverHTML, { waitUntil: 'networkidle' });

    // フォントの読み込みを待つ
    await page.evaluateHandle('document.fonts.ready');
    // 追加の待機（フォントレンダリングのため）
    await page.waitForTimeout(2000);

    // JPEG形式で出力（KDP推奨）
    const screenshotBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 95,
      fullPage: false,
    });

    await browser.close();

    // ファイルに保存
    fs.writeFileSync(coverPath, screenshotBuffer);

    const fileSizeBytes = screenshotBuffer.length;

    sse.send({
      step: 'cover',
      status: 'completed',
      message: `表紙生成完了 (1600x2560px, JPEG, ${Math.round(fileSizeBytes / 1024)}KB)`,
    });

    return {
      coverPath,
      coverBuffer: Buffer.from(screenshotBuffer),
      format: 'jpeg',
      dimensions: { width: 1600, height: 2560 },
      fileSizeBytes,
      kdpCompliant: fileSizeBytes <= 50 * 1024 * 1024, // 50MB以下
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sse.send({
      step: 'cover',
      status: 'completed',
      message: `表紙生成をスキップ (Playwright利用不可: ${message.slice(0, 100)})`,
    });

    // Playwrightが利用不可の場合は空のカバーを返す
    return {
      coverPath: '',
      coverBuffer: Buffer.alloc(0),
      format: 'jpeg',
      dimensions: { width: 0, height: 0 },
      fileSizeBytes: 0,
      kdpCompliant: false,
    };
  }
}
