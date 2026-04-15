/**
 * パイプラインオーケストレータ
 * 9フェーズを順次実行し、各フェーズの結果を次のフェーズに渡す
 * SSEでリアルタイム進捗通知
 * Vercel互換モード: Phase 6,8,9はVercelでスキップ
 */

import fs from 'node:fs';
import path from 'node:path';
import { SSEManager } from './sse-manager';
import { ClaudeClient } from './clients/claude-client';
import { GeminiClient } from './clients/gemini-client';
import { executeResearch } from './phases/01-research';
import { executeTitle } from './phases/02-title';
import { executeOutline } from './phases/03-outline';
import { executeWriting } from './phases/04-writing';
import { executeQualityGate } from './phases/05-quality-gate';
import { executeCover } from './phases/06-cover';
import { executeEpub } from './phases/07-epub';
import { executeConfig } from './phases/08-config';
import { executeKdpUpload } from './phases/09-kdp-upload';
import type {
  PipelineConfig,
  PipelineResult,
  CoverResult,
  QualityReport,
} from './types';

function slugify(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f\uff00-\uffef-]/g, '')
    .slice(0, 40);
}

/**
 * パイプライン全体を実行する
 */
export async function executePipeline(
  config: PipelineConfig,
  controller: ReadableStreamDefaultController
): Promise<void> {
  const sse = new SSEManager(controller);
  const startTime = Date.now();

  // keepalive開始（接続切れ防止）
  sse.startKeepAlive();

  try {
    // APIクライアント初期化
    const claude = new ClaudeClient();
    const gemini = new GeminiClient();

    // 出力ディレクトリの作成
    const tmpBase = process.env.VERCEL ? '/tmp' : process.cwd();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:]/g, '')
      .slice(0, 14)
      .replace(/(\d{8})(\d{6})/, '$1-$2');
    const themeSlug = slugify(config.theme);
    const runDir = path.join(
      tmpBase,
      'research',
      'runs',
      `${timestamp}__${themeSlug}`
    );
    const ebookDir = path.join(runDir, 'ebook');
    fs.mkdirSync(ebookDir, { recursive: true });

    // ── Phase 1: 多層リサーチ ──────────────────────────────────
    const researchResult = await executeResearch(config, claude, sse);

    // ── Phase 2: タイトル生成・選定 ────────────────────────────
    const titleResult = await executeTitle(researchResult, claude, sse);

    // ── Phase 3: 章構成設計 ────────────────────────────────────
    const outlineResult = await executeOutline(
      researchResult,
      titleResult,
      claude,
      sse
    );

    // ── Phase 4: 全7章並列執筆 ─────────────────────────────────
    const writingResult = await executeWriting(
      config,
      researchResult,
      outlineResult,
      claude,
      sse,
      ebookDir
    );

    // ── Phase 5: 品質ゲート ────────────────────────────────────
    const qualityResult = await executeQualityGate(
      config,
      writingResult,
      researchResult,
      outlineResult,
      claude,
      sse
    );

    // ── Phase 6: 表紙生成 ──────────────────────────────────────
    let coverResult: CoverResult;
    if (process.env.VERCEL) {
      // Vercel環境ではスキップ
      sse.send({
        step: 'cover',
        status: 'completed',
        message: '表紙生成スキップ (Vercel環境)',
      });
      coverResult = {
        coverPath: '',
        coverBuffer: Buffer.alloc(0),
        format: 'jpeg',
        dimensions: { width: 0, height: 0 },
        fileSizeBytes: 0,
        kdpCompliant: false,
      };
    } else {
      coverResult = await executeCover(
        outlineResult.outline,
        config.authorName,
        config.theme,
        gemini,
        sse,
        runDir
      );
    }

    // ── Phase 7: EPUB生成 ──────────────────────────────────────
    const epubResult = await executeEpub(
      qualityResult.chapters,
      coverResult,
      outlineResult.outline,
      config.authorName,
      claude,
      sse,
      runDir
    );

    // ── Phase 8: book-config.json更新 ──────────────────────────
    if (!process.env.VERCEL) {
      await executeConfig(
        outlineResult.outline,
        epubResult.epubPath,
        coverResult.coverPath,
        config.price,
        config.authorName,
        qualityResult.report,
        sse
      );
    } else {
      sse.send({
        step: 'config',
        status: 'completed',
        message: 'book-config.json更新スキップ (Vercel環境)',
      });
    }

    // ── Phase 9: KDPアップロード ────────────────────────────────
    if (!process.env.VERCEL) {
      await executeKdpUpload(sse);
    } else {
      sse.send({
        step: 'kdp-upload',
        status: 'completed',
        message: 'KDPアップロードスキップ (Vercel環境)',
      });
    }

    // ── 完了 ──────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const tokenUsage = claude.getTokenUsage();

    const result: PipelineResult = {
      success: true,
      title: outlineResult.outline.title,
      epubPath: epubResult.epubPath,
      epubBase64: epubResult.epubBase64,
      epubFileName: epubResult.epubFileName,
      coverPath: coverResult.coverPath,
      outputDir: runDir,
      qualityReport: qualityResult.report,
      tokenUsage,
      durationMs,
    };

    sse.send({
      step: 'done',
      status: 'completed',
      message: '電子書籍の生成が完了しました',
      outputDir: result.outputDir,
      epubPath: result.epubPath,
      coverPath: result.coverPath,
      title: result.title,
      epubBase64: result.epubBase64,
      epubFileName: result.epubFileName,
      qualityScore: result.qualityReport.overallScore,
      tokenUsage: result.tokenUsage,
      durationMs: result.durationMs,
    });

    sse.done();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Pipeline] エラー:', message);
    sse.error(message);
  }
}
