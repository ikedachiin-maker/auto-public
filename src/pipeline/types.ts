/**
 * パイプライン共通型定義
 * SDD-001 architecture.md に基づく型定義
 */

// ── パイプライン設定 ──────────────────────────────────────────

export interface PipelineConfig {
  theme: string;
  targetAudience: string;
  chapterCount: number; // default: 7
  authorName: string;
  price: string;
  lineUrl: string;
}

// ── Phase 1: リサーチ結果 ──────────────────────────────────────

export interface DataPoint {
  /** 「市場規模は○○億円」等 */
  fact: string;
  /** 出典情報 */
  source?: string;
  /** 調査年 */
  year?: string;
}

export interface ResearchResult {
  /** 市場・トレンド調査結果 (1000字以上) */
  marketResearch: string;
  /** 競合書籍分析結果 (1000字以上) */
  competitorAnalysis: string;
  /** ターゲット読者ペインポイント深堀り (1000字以上) */
  painPointAnalysis: string;
  /** 統合リサーチサマリー */
  summary: string;
  /** 抽出された具体的数値データ (最低5つ) */
  dataPoints: DataPoint[];
}

// ── Phase 2: タイトル生成結果 ──────────────────────────────────

export interface TitleCandidate {
  title: string;
  subtitle: string;
  scores: {
    appeal: number; // 訴求力 (1-10)
    differentiation: number; // 差別化 (1-10)
    seo: number; // 検索性 (1-10)
    curiosity: number; // 好奇心喚起 (1-10)
  };
  totalScore: number; // 合計 (4-40)
}

export interface TitleGenerationResult {
  candidates: TitleCandidate[];
  selectedTitle: string;
  selectedSubtitle: string;
}

// ── Phase 3: アウトライン結果 ──────────────────────────────────

export interface OutlineChapter {
  number: number;
  title: string;
  points: string[]; // 5つ以上
  storyArcRole: string; // ストーリーアーク上の役割
}

export interface Outline {
  title: string;
  subtitle: string;
  description: string; // 300字程度の内容紹介文
  keywords: string[]; // 最大7個
  chapters: OutlineChapter[];
}

export interface OutlineResult {
  outline: Outline;
  chapterCandidates?: OutlineChapter[][]; // 各章3候補
}

// ── Phase 4: 執筆結果 ──────────────────────────────────────────

export interface ChapterContent {
  number: number;
  title: string;
  markdown: string; // 3000字以上
  filePath: string;
  charCount: number;
}

export interface WritingResult {
  chapters: ChapterContent[];
}

// ── Phase 5: 品質ゲート結果 ────────────────────────────────────

export interface ChapterScore {
  chapterNumber: number;
  charCount: number;
  charCountScore: number; // 最大10点
  dataDensityScore: number; // 最大20点
  exampleScore: number; // 最大15点
  structureScore: number; // 最大10点
  actionScore: number; // 最大10点
  totalScore: number; // 最大65点
  percentage: number; // パーセンテージ
  passed: boolean; // 80%以上でtrue
}

export interface QualityReport {
  chapterScores: ChapterScore[];
  overallScore: number; // 全章平均パーセンテージ
  passed: boolean;
  retriedChapters: number[];
}

export interface QualityGateResult {
  chapters: ChapterContent[];
  report: QualityReport;
}

// ── Phase 6: 表紙生成結果 ──────────────────────────────────────

export interface CoverResult {
  coverPath: string;
  coverBuffer: Buffer;
  format: 'jpeg' | 'png';
  dimensions: { width: number; height: number };
  fileSizeBytes: number;
  kdpCompliant: boolean;
}

// ── Phase 7: EPUB生成結果 ──────────────────────────────────────

export interface EPUBResult {
  epubPath: string;
  epubBuffer: Buffer;
  epubBase64: string;
  epubFileName: string;
}

// ── Phase 8: book-config結果 ──────────────────────────────────

export interface BookConfigResult {
  configPath: string;
  config: Record<string, unknown>;
  historyRecorded: boolean;
}

// ── Phase 9: KDPアップロード結果 ──────────────────────────────

export interface KDPUploadResult {
  uploaded: boolean;
  skipped: boolean;
  reason?: string;
}

// ── パイプライン全体結果 ──────────────────────────────────────

export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  callCount: number;
}

export interface PipelineResult {
  success: boolean;
  title: string;
  epubPath: string;
  epubBase64: string;
  epubFileName: string;
  coverPath: string;
  outputDir: string;
  qualityReport: QualityReport;
  tokenUsage: TokenUsage;
  durationMs: number;
}

// ── SSEイベント ──────────────────────────────────────────────

export interface SSEEvent {
  step: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
  chapter?: number;
  total?: number;
  qualityScore?: number;
  [key: string]: unknown;
}

// ── Claude APIクライアント ──────────────────────────────────

export interface ClaudeCallOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number; // default: 8192
  temperature?: number;
}

export interface ClaudeResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
