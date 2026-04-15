/**
 * Phase 5: 品質スコアリング + 再生成
 * - 各章をスコアリング（65点満点）
 *   - 文字数（3000字以上=10点）
 *   - データ密度（数値データ個数x2点、最大20点）
 *   - 具体事例（各5点、最大15点）
 *   - 構成（見出し数=10点）
 *   - アクション性（実践ステップ=10点）
 * - 80%未満（52点未満）-> 再生成（最大2回）
 */

import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type {
  WritingResult,
  QualityGateResult,
  ChapterContent,
  ChapterScore,
  QualityReport,
  ResearchResult,
  OutlineResult,
  PipelineConfig,
} from '../types';

// ── スコアリングエンジン ──────────────────────────────────────

function scoreChapter(markdown: string, chapterNumber: number): ChapterScore {
  const charCount = markdown.length;

  // 1. 文字数スコア（最大10点）
  let charCountScore: number;
  if (charCount >= 3000) {
    charCountScore = 10;
  } else if (charCount >= 2500) {
    charCountScore = 7;
  } else {
    charCountScore = 3;
  }

  // 2. データ密度スコア（最大20点）
  // 数値データの正規表現: 数字 + 単位（%、万、億、円、件、回、年、ドル等）
  const dataPattern = /\d+[%％万億円件回年ドル倍個社人名本冊]/g;
  const dataMatches = markdown.match(dataPattern) || [];
  const dataDensityScore = Math.min(dataMatches.length * 2, 20);

  // 3. 具体事例スコア（最大15点）
  const examplePatterns = [
    /事例/g,
    /ケース/g,
    /実際に/g,
    /例えば/g,
    /具体的に/g,
    /実例/g,
    /成功事例/g,
    /失敗事例/g,
  ];
  let exampleCount = 0;
  for (const pattern of examplePatterns) {
    const matches = markdown.match(pattern);
    if (matches) exampleCount += matches.length;
  }
  const exampleScore = Math.min(exampleCount * 5, 15);

  // 4. 構成スコア（最大10点）
  const h2Matches = markdown.match(/^##\s+/gm) || [];
  const h3Matches = markdown.match(/^###\s+/gm) || [];
  let structureScore: number;
  const h2Count = h2Matches.length;
  if (h2Count >= 2 && h2Count <= 5) {
    structureScore = 10;
  } else if (h2Count === 1) {
    structureScore = 5;
  } else {
    structureScore = 3;
  }
  // H3の存在でボーナス（ただし上限10点）
  if (h3Matches.length > 0 && structureScore < 10) {
    structureScore = Math.min(structureScore + 2, 10);
  }

  // 5. アクション性スコア（最大10点）
  const actionPatterns = [
    /ステップ/g,
    /実践/g,
    /やってみ/g,
    /始め/g,
    /試して/g,
    /実行/g,
    /アクション/g,
    /取り組/g,
    /チャレンジ/g,
  ];
  let actionCount = 0;
  for (const pattern of actionPatterns) {
    const matches = markdown.match(pattern);
    if (matches) actionCount += matches.length;
  }
  const actionScore = actionCount > 0 ? 10 : 0;

  const totalScore =
    charCountScore + dataDensityScore + exampleScore + structureScore + actionScore;
  const percentage = Math.round((totalScore / 65) * 100);

  return {
    chapterNumber,
    charCount,
    charCountScore,
    dataDensityScore,
    exampleScore,
    structureScore,
    actionScore,
    totalScore,
    percentage,
    passed: percentage >= 80,
  };
}

// ── 品質ゲート実行 ──────────────────────────────────────────

export async function executeQualityGate(
  config: PipelineConfig,
  writingResult: WritingResult,
  research: ResearchResult,
  outlineResult: OutlineResult,
  claude: ClaudeClient,
  sse: SSEManager
): Promise<QualityGateResult> {
  sse.send({
    step: 'quality-gate',
    status: 'running',
    message: '品質チェック中...',
  });

  const chapters = [...writingResult.chapters];
  const retriedChapters: number[] = [];
  const maxRetries = 2;

  // Step 1: 全章をスコアリング
  let chapterScores = chapters.map((ch) =>
    scoreChapter(ch.markdown, ch.number)
  );

  // Step 2: 基準未満の章を再生成
  for (let retry = 0; retry < maxRetries; retry++) {
    const failedChapters = chapterScores.filter((s) => !s.passed);
    if (failedChapters.length === 0) break;

    for (const failedScore of failedChapters) {
      const chapterIdx = chapters.findIndex(
        (ch) => ch.number === failedScore.chapterNumber
      );
      if (chapterIdx === -1) continue;

      const chapter = chapters[chapterIdx];
      const outlineChapter = outlineResult.outline.chapters.find(
        (ch) => ch.number === failedScore.chapterNumber
      );

      sse.send({
        step: 'quality-gate',
        status: 'running',
        message: `第${failedScore.chapterNumber}章: スコア ${failedScore.totalScore}/65 (${failedScore.percentage}%) - 基準未満、再生成中... (${retry + 1}/${maxRetries})`,
      });

      // 改善指示を含むプロンプトで再生成
      const improvementInstructions: string[] = [];
      if (failedScore.charCountScore < 10) {
        improvementInstructions.push(
          '- 文字数が不足しています。3000字以上になるよう、各セクションを充実させてください'
        );
      }
      if (failedScore.dataDensityScore < 14) {
        improvementInstructions.push(
          '- 数値データが不足しています。具体的な数字（%、万、億、円、件など）を増やしてください'
        );
      }
      if (failedScore.exampleScore < 10) {
        improvementInstructions.push(
          '- 具体的な事例が不足しています。「事例」「実際に」「例えば」などを使った具体例を追加してください'
        );
      }
      if (failedScore.structureScore < 7) {
        improvementInstructions.push(
          '- 見出し構成が不適切です。H2見出しを2-5個、H3見出しも適宜使用してください'
        );
      }
      if (failedScore.actionScore < 10) {
        improvementInstructions.push(
          '- 実践的なアクションステップが不足しています。「ステップ」「実践」「始め」などの行動を促す記述を追加してください'
        );
      }

      try {
        const res = await claude.call({
          prompt: `以下の電子書籍の章を品質改善して書き直してください。

## 現在の内容
${chapter.markdown}

## 改善が必要な点
${improvementInstructions.join('\n')}

## 章の情報
- 章番号: 第${chapter.number}章
- タイトル: ${chapter.title}
- ストーリーアーク: ${outlineChapter?.storyArcRole || ''}
- ポイント: ${outlineChapter?.points.join(', ') || ''}

## リサーチデータ（活用すること）
${research.dataPoints.map((dp) => `- ${dp.fact}`).join('\n')}

## 執筆要件（必須）
1. 3000字以上で書く
2. 数値データを3つ以上含める
3. 具体的な事例を1つ以上含める
4. 実践可能なアクションステップを3つ以上含める
5. 見出し（##、###）を効果的に使う

本文のみをMarkdown形式で出力してください。`,
          systemPrompt: `${config.theme}の専門家として、${config.targetAudience}向けに実践的でわかりやすい文章を書いてください。`,
          maxTokens: 16384,
        });

        // 再生成した内容で更新
        chapters[chapterIdx] = {
          ...chapter,
          markdown: res.text,
          charCount: res.text.length,
        };

        if (!retriedChapters.includes(chapter.number)) {
          retriedChapters.push(chapter.number);
        }
      } catch (err) {
        // 再生成失敗時は元の版を維持
        console.warn(
          `[QualityGate] 第${chapter.number}章の再生成に失敗:`,
          err
        );
      }
    }

    // 再スコアリング
    chapterScores = chapters.map((ch) =>
      scoreChapter(ch.markdown, ch.number)
    );
  }

  // 最終スコアリング結果をSSEで送信
  const overallScore = Math.round(
    chapterScores.reduce((sum, s) => sum + s.percentage, 0) /
      chapterScores.length
  );
  const allPassed = chapterScores.every((s) => s.passed);

  // 基準未満の章がある場合は警告
  const failedAfterRetry = chapterScores.filter((s) => !s.passed);
  if (failedAfterRetry.length > 0) {
    sse.send({
      step: 'quality-gate',
      status: 'running',
      message: `警告: ${failedAfterRetry.length}章が基準未満のまま続行します`,
    });
  }

  const report: QualityReport = {
    chapterScores,
    overallScore,
    passed: allPassed,
    retriedChapters,
  };

  sse.send({
    step: 'quality-gate',
    status: 'completed',
    message: `品質チェック完了: 全体スコア ${overallScore}% (${allPassed ? '合格' : '一部基準未満'})`,
    qualityScore: overallScore,
  });

  return { chapters, report };
}
