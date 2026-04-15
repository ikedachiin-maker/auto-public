/**
 * Phase 4: 全7章並列執筆（各3000字+）
 * - 7章をPromise.allで並列生成
 * - 各章3000字以上（maxTokens: 16384）
 * - リサーチ結果を各章プロンプトに注入
 * - 各章にデータ3つ以上、事例1つ以上、アクションステップ3つ以上
 * - 第7章末尾にLINE CTA
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type {
  ResearchResult,
  OutlineResult,
  WritingResult,
  ChapterContent,
  PipelineConfig,
} from '../types';

// 専門家ペルソナマッピング
const PERSONAS: Record<number, { role: string; description: string }> = {
  1: {
    role: '業界アナリスト',
    description: 'データに基づく市場分析の専門家。読者の現状の痛みを数値で明確化する',
  },
  2: {
    role: '教育者・研究者',
    description: '概念を体系的にわかりやすく伝える専門家。基礎知識を丁寧に解説する',
  },
  3: {
    role: 'シニアコンサルタント',
    description: '原理原則を実務に落とし込む専門家。メカニズムを具体データで裏付ける',
  },
  4: {
    role: '実務コンサルタント',
    description: 'ステップバイステップ指導の専門家。すぐに実践できる手法を提供する',
  },
  5: {
    role: 'ケーススタディ研究者',
    description: '成功・失敗の要因分析の専門家。リアルな事例で学びを深める',
  },
  6: {
    role: '戦略アドバイザー',
    description: '応用戦略と長期ビジョンの専門家。上級テクニックと組み合わせ戦略を教える',
  },
  7: {
    role: 'メンター・コーチ',
    description: '読者の行動を促すモチベーターの専門家。全体を振り返り次のステップへ導く',
  },
};

function zeroPad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function executeWriting(
  config: PipelineConfig,
  research: ResearchResult,
  outlineResult: OutlineResult,
  claude: ClaudeClient,
  sse: SSEManager,
  ebookDir: string
): Promise<WritingResult> {
  const { theme, targetAudience, lineUrl } = config;
  const { outline } = outlineResult;
  const chapterCount = outline.chapters.length;

  sse.send({
    step: 'writing',
    status: 'running',
    message: `全${chapterCount}章を並列執筆中...`,
    chapter: 0,
    total: chapterCount,
  });

  // リサーチデータを各章のプロンプトに注入するテキスト
  const researchContext = `
## リサーチデータ（各章で必ず活用すること）

### 市場・トレンド
${research.marketResearch.slice(0, 3000)}

### 競合分析
${research.competitorAnalysis.slice(0, 2000)}

### ターゲットの悩み
${research.painPointAnalysis.slice(0, 2000)}

### 数値データポイント
${research.dataPoints.map((dp) => `- ${dp.fact}`).join('\n')}
`.trim();

  let completedCount = 0;
  const chapterResults: ChapterContent[] = [];

  // 7章を並列生成
  const chapterPromises = outline.chapters.map(async (chapter) => {
    const chapterNum = chapter.number;
    const persona = PERSONAS[chapterNum] || PERSONAS[1];
    const isLastChapter = chapterNum === chapterCount;

    // 第7章用のLINE誘導指示
    const lineCTAInstruction = isLastChapter && lineUrl
      ? `

## 重要: LINE誘導の指示
この章は最終章です。以下を自然に組み込んでください:
- 本書全体の学びを振り返るまとめ
- さらに深い情報が得られることへの期待感の醸成
- LINE公式アカウントで限定コンテンツを配信していることへの自然な言及
- 最後に以下のLINE URLへの誘導CTA（唐突にならないよう、文脈に沿って自然に配置）

LINE URL: ${lineUrl}

CTAのイメージ:
「本書でお伝えした内容は、ほんの入り口にすぎません。実践的なノウハウや最新情報を、LINE公式アカウントで無料配信しています。今すぐ友だち追加して、あなたの次の一歩を踏み出してください。」`
      : '';

    const chapterPrompt = `以下の情報を元に、電子書籍「${outline.title}」の第${chapterNum}章「${chapter.title}」を執筆してください。

## 書籍情報
- タイトル: ${outline.title}
- サブタイトル: ${outline.subtitle}
- 対象読者: ${targetAudience}
- テーマ: ${theme}

## この章の情報
- 章番号: 第${chapterNum}章
- タイトル: ${chapter.title}
- ストーリーアーク上の役割: ${chapter.storyArcRole}
- 扱うポイント:
${chapter.points.map((p) => `  - ${p}`).join('\n')}

${researchContext}
${lineCTAInstruction}

## 執筆要件（必須）
1. **3000字以上**で書く（重要: 絶対に3000字未満にしないこと）
2. **数値データを3つ以上**含める（リサーチデータから引用すること）
3. **具体的な事例・ケーススタディを1つ以上**含める
4. **実践可能なアクションステップを3つ以上**含める
5. 見出し（##、###）を効果的に使う（H2を2-5個、H3を適宜）
6. 箇条書きや表を活用してわかりやすくする
7. 日本語で書く
8. 読者が「今すぐ実践したい」と思える実用的な内容にする

## 出力形式
本文のみをMarkdown形式で出力してください。
章番号やタイトルの見出し行（## 第X章 ...）は不要です。本文から始めてください。`;

    const systemPrompt = `あなたは「${persona.role}」です。${persona.description}
${theme}の分野で20年以上の経験を持ち、${targetAudience}への指導実績が豊富です。
実践的でわかりやすい文章を書いてください。データと事例を豊富に盛り込み、読者が具体的に行動できる内容にしてください。`;

    const res = await claude.call({
      prompt: chapterPrompt,
      systemPrompt,
      maxTokens: 16384,
    });

    const chapterContent = res.text;
    const fileName = `${zeroPad(chapterNum)}_${chapter.title}.md`;
    const filePath = path.join(ebookDir, fileName);

    // Markdownファイルとして保存（見出し付き）
    const fileContent = `## 第${chapterNum}章 ${chapter.title}\n\n${chapterContent}\n`;
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    const result: ChapterContent = {
      number: chapterNum,
      title: chapter.title,
      markdown: chapterContent,
      filePath,
      charCount: chapterContent.length,
    };

    chapterResults.push(result);

    completedCount++;
    sse.send({
      step: 'writing',
      status: 'running',
      message: `第${chapterNum}章「${chapter.title}」執筆完了 (${completedCount}/${chapterCount})`,
      chapter: completedCount,
      total: chapterCount,
    });

    return result;
  });

  await Promise.all(chapterPromises);

  // 章番号順にソート
  chapterResults.sort((a, b) => a.number - b.number);

  const totalChars = chapterResults.reduce((sum, ch) => sum + ch.charCount, 0);
  sse.send({
    step: 'writing',
    status: 'completed',
    message: `全${chapterCount}章の執筆完了 (合計${totalChars.toLocaleString()}字)`,
  });

  return { chapters: chapterResults };
}
