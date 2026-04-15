/**
 * Phase 8: book-config.json更新
 * - book-config.jsonを更新
 * - 生成履歴記録
 * - Vercel環境ではスキップ
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SSEManager } from '../sse-manager';
import type {
  Outline,
  QualityReport,
  BookConfigResult,
} from '../types';

export async function executeConfig(
  outline: Outline,
  epubPath: string,
  coverPath: string,
  price: string,
  authorName: string,
  qualityReport: QualityReport,
  sse: SSEManager
): Promise<BookConfigResult> {
  const projectRoot = process.cwd();

  // Vercel環境ではスキップ
  if (process.env.VERCEL) {
    sse.send({
      step: 'config',
      status: 'completed',
      message: 'book-config.json更新スキップ (Vercel環境)',
    });
    return {
      configPath: '',
      config: {},
      historyRecorded: false,
    };
  }

  sse.send({
    step: 'config',
    status: 'running',
    message: 'book-config.json 更新中...',
  });

  const bookConfigPath = path.join(
    projectRoot,
    'scripts',
    'kdp-uploader',
    'book-config.json'
  );

  let config: Record<string, unknown> = {};

  try {
    // 既存の設定を読み込み
    if (fs.existsSync(bookConfigPath)) {
      const existingContent = fs.readFileSync(bookConfigPath, 'utf-8');
      config = JSON.parse(existingContent);
    }

    // 設定を更新
    config = {
      ...config,
      title: outline.title,
      subtitle: outline.subtitle,
      author: authorName,
      description: outline.description,
      keywords: outline.keywords.slice(0, 7),
      manuscriptPath: path.relative(projectRoot, epubPath),
      coverPath: coverPath ? path.relative(projectRoot, coverPath) : '',
      price,
      royaltyPlan: '70',
      enableDRM: false,
      language: 'ja',
      aiDisclosure: true,
      aiDisclosureText:
        '本書はAI支援ツール（Claude）を活用して執筆されています。著者が検証・編集を行っています。',
      lastUpdated: new Date().toISOString(),
      qualityScore: qualityReport.overallScore,
    };

    fs.writeFileSync(bookConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Config] book-config.json更新失敗:', err);
  }

  // 生成履歴を記録
  let historyRecorded = false;
  try {
    const historyDir = path.join(projectRoot, 'research');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    const historyPath = path.join(historyDir, 'history.json');

    let history: Record<string, unknown>[] = [];
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      } catch {
        history = [];
      }
    }

    history.push({
      title: outline.title,
      generatedAt: new Date().toISOString(),
      qualityScore: qualityReport.overallScore,
      epubPath: path.relative(projectRoot, epubPath),
      coverPath: coverPath ? path.relative(projectRoot, coverPath) : '',
      chapterCount: outline.chapters.length,
    });

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    historyRecorded = true;
  } catch (err) {
    console.warn('[Config] 生成履歴の記録に失敗:', err);
  }

  sse.send({
    step: 'config',
    status: 'completed',
    message: '設定更新完了',
  });

  return {
    configPath: bookConfigPath,
    config,
    historyRecorded,
  };
}
