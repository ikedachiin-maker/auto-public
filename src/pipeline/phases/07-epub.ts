/**
 * Phase 7: EPUB生成（marked変換, 表紙, AI開示, TOC）
 * - markedライブラリでMarkdown -> HTML変換
 * - 表紙画像をEPUBに埋め込み
 * - AI開示ページを冒頭に追加
 * - 目次（TOC）を生成
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import epub from 'epub-gen-memory';
import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type {
  ChapterContent,
  CoverResult,
  Outline,
  EPUBResult,
} from '../types';

// EPUB用CSSスタイル（拡充版）
const EPUB_CSS = `
body {
  font-family: 'Noto Sans JP', sans-serif;
  line-height: 1.8;
  color: #333;
  padding: 0 1em;
}
h2 { margin-top: 2em; font-size: 1.4em; border-bottom: 2px solid #333; padding-bottom: 0.3em; }
h3 { margin-top: 1.5em; font-size: 1.2em; }
h4 { margin-top: 1.2em; font-size: 1.1em; }
p { margin: 0.8em 0; text-indent: 1em; }
ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 0.5em; text-align: left; }
th { background-color: #f5f5f5; font-weight: bold; }
blockquote { border-left: 3px solid #ccc; padding-left: 1em; margin: 1em 0; color: #666; }
hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
strong { font-weight: bold; }
em { font-style: italic; }
`.trim();

// AI開示ページのHTML
const AI_DISCLOSURE_HTML = `
<div style="text-align: center; margin-top: 3em;">
  <h2>本書の執筆について</h2>
</div>
<p>本書は、AI支援ツール（Claude by Anthropic）を活用して執筆されています。</p>
<p>リサーチ、構成設計、本文執筆、品質チェックの各プロセスにおいてAIを使用しました。著者が最終的な検証・編集を行っています。</p>
<p>AI技術の進化により、より質の高いコンテンツを迅速にお届けすることが可能になりました。読者の皆様にとって有益な情報をお届けすることを第一に考えて制作しました。</p>
<hr>
`.trim();

function slugify(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef-]/g, '')
    .slice(0, 40);
}

export async function executeEpub(
  chapters: ChapterContent[],
  cover: CoverResult,
  outline: Outline,
  authorName: string,
  claude: ClaudeClient,
  sse: SSEManager,
  runDir: string
): Promise<EPUBResult> {
  sse.send({
    step: 'epub',
    status: 'running',
    message: 'EPUB生成中... (Markdown -> HTML変換)',
  });

  // 1. 「はじめに」を生成
  let introductionHTML = '';
  try {
    const introRes = await claude.call({
      prompt: `電子書籍「${outline.title}」の「はじめに」を300-500字で書いてください。

書籍概要: ${outline.description}
ターゲット読者に対して、本書を読むことで得られる価値と、各章の概要を簡潔に伝えてください。

本文のみをMarkdown形式で出力してください。`,
      systemPrompt: '日本語で書いてください。温かみのある親しみやすい文体で。',
      maxTokens: 2048,
    });
    introductionHTML = marked(introRes.text) as string;
  } catch {
    introductionHTML = '<p>本書をお手に取っていただきありがとうございます。</p>';
  }

  // 2. 「おわりに」を生成
  let afterwordHTML = '';
  try {
    const afterRes = await claude.call({
      prompt: `電子書籍「${outline.title}」の「おわりに」を200-400字で書いてください。

読者への感謝、本書の学びの振り返り、今後の行動への励ましを含めてください。

本文のみをMarkdown形式で出力してください。`,
      systemPrompt: '日本語で書いてください。温かみのある文体で。',
      maxTokens: 2048,
    });
    afterwordHTML = marked(afterRes.text) as string;
  } catch {
    afterwordHTML = '<p>最後までお読みいただきありがとうございました。</p>';
  }

  // 3. 各章のMarkdown -> HTML変換（markedライブラリ使用）
  sse.send({
    step: 'epub',
    status: 'running',
    message: 'EPUB生成中... (表紙・目次・メタデータ設定)',
  });

  const epubChapters: { title: string; content: string }[] = [];

  // AI開示ページ
  epubChapters.push({
    title: '本書の執筆について',
    content: AI_DISCLOSURE_HTML,
  });

  // はじめに
  epubChapters.push({
    title: 'はじめに',
    content: introductionHTML,
  });

  // 各章をmarkedで変換
  for (const chapter of chapters) {
    const fullMarkdown = `## 第${chapter.number}章 ${chapter.title}\n\n${chapter.markdown}`;
    let html: string;
    try {
      html = marked(fullMarkdown) as string;
    } catch {
      // markedが失敗した場合は簡易変換にフォールバック
      html = fullMarkdown
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
        .replace(/^(?!<[hulo])((?!<div|<p).+)$/gm, '<p>$1</p>')
        .replace(/<p><\/p>/g, '')
        .replace(/\n{2,}/g, '\n');
    }
    epubChapters.push({
      title: `第${chapter.number}章 ${chapter.title}`,
      content: html,
    });
  }

  // おわりに
  epubChapters.push({
    title: 'おわりに',
    content: afterwordHTML,
  });

  // 著者紹介
  epubChapters.push({
    title: '著者紹介',
    content: `<div style="text-align: center; margin-top: 2em;">
      <h2>著者紹介</h2>
      <p style="font-size: 1.2em; margin-top: 1em;">${authorName}</p>
    </div>`,
  });

  // 4. EPUBファイル生成
  const themeSlug = slugify(outline.title);
  const epubFileName = `${themeSlug}.epub`;
  const epubPath = path.join(runDir, epubFileName);

  // EPUB生成オプション
  const epubOptions: Parameters<typeof epub>[0] = {
    title: outline.title,
    author: authorName,
    description: outline.description || '',
    css: EPUB_CSS,
    lang: 'ja',
    tocTitle: '目次',
  };

  // 表紙画像がある場合はファイルパスで埋め込む
  if (cover.coverPath && cover.coverBuffer && cover.coverBuffer.length > 0) {
    epubOptions.cover = cover.coverPath;
  }

  try {
    const epubBuffer = await epub(epubOptions, epubChapters);
    fs.writeFileSync(epubPath, epubBuffer);

    const epubBase64 = epubBuffer.toString('base64');

    sse.send({
      step: 'epub',
      status: 'completed',
      message: 'EPUB生成完了',
    });

    return {
      epubPath,
      epubBuffer: Buffer.from(epubBuffer),
      epubBase64,
      epubFileName,
    };
  } catch (err) {
    // 表紙埋め込み失敗時は表紙なしで再試行
    if (cover.coverBuffer && cover.coverBuffer.length > 0) {
      console.warn('[EPUB] 表紙付きEPUB生成失敗、表紙なしで再試行:', err);
      delete epubOptions.cover;

      const epubBuffer = await epub(epubOptions, epubChapters);
      fs.writeFileSync(epubPath, epubBuffer);

      const epubBase64 = epubBuffer.toString('base64');

      sse.send({
        step: 'epub',
        status: 'completed',
        message: 'EPUB生成完了 (表紙なし)',
      });

      return {
        epubPath,
        epubBuffer: Buffer.from(epubBuffer),
        epubBase64,
        epubFileName,
      };
    }
    throw err;
  }
}
