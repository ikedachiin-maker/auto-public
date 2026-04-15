/**
 * Phase 2: タイトル10候補生成 + 4軸スコアリング
 * - Step 1: リサーチ結果を基にタイトル10候補生成
 * - Step 2: 4軸スコアリング（訴求力/差別化/検索性/好奇心）
 * - 最高スコアのタイトルを自動採用
 */

import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type { ResearchResult, TitleGenerationResult, TitleCandidate } from '../types';

export async function executeTitle(
  research: ResearchResult,
  claude: ClaudeClient,
  sse: SSEManager
): Promise<TitleGenerationResult> {
  // Step 1: タイトル10候補生成
  sse.send({
    step: 'title',
    status: 'running',
    message: 'タイトル候補を10個生成中...',
  });

  const candidatesRes = await claude.call({
    prompt: `以下のリサーチ結果を基に、電子書籍のタイトル候補を10個生成してください。
各候補にサブタイトル案も付けてください。

## リサーチサマリー
${research.summary}

## 市場分析
${research.marketResearch.slice(0, 2000)}

## 競合分析
${research.competitorAnalysis.slice(0, 2000)}

## ターゲットの悩み
${research.painPointAnalysis.slice(0, 2000)}

以下の条件を満たすタイトルを生成してください:
- Amazon Kindleで目を引く魅力的なタイトル
- ターゲット読者の悩みに直接訴求
- 具体的なベネフィットが伝わる
- 長すぎない（20文字以内が理想）
- 競合との差別化が明確

以下のJSON形式のみで出力してください:
[
  {"title": "タイトル1", "subtitle": "サブタイトル1"},
  {"title": "タイトル2", "subtitle": "サブタイトル2"},
  ...（10個）
]`,
    systemPrompt:
      'JSONのみで返してください。説明文は不要です。日本語で回答してください。',
    maxTokens: 4096,
  });

  // JSON解析
  let rawCandidates: { title: string; subtitle: string }[] = [];
  try {
    const jsonMatch = candidatesRes.text.match(/\[[\s\S]*\]/);
    rawCandidates = JSON.parse(jsonMatch ? jsonMatch[0] : candidatesRes.text);
  } catch {
    throw new Error('タイトル候補のJSON解析に失敗しました');
  }

  // Step 2: 4軸スコアリング
  sse.send({
    step: 'title',
    status: 'running',
    message: '4軸スコアリング中...',
  });

  const titlesForScoring = rawCandidates
    .map((c, i) => `${i + 1}. 「${c.title}」（${c.subtitle}）`)
    .join('\n');

  const scoringRes = await claude.call({
    prompt: `以下の10個のタイトル候補を、4つの軸でスコアリングしてください。
各軸は1〜10点で評価してください。

## タイトル候補
${titlesForScoring}

## 評価軸
1. appeal（訴求力）: ターゲット読者が思わず手に取りたくなるか
2. differentiation（差別化）: 競合書籍と比べて独自性があるか
3. seo（検索性）: Amazon検索で発見されやすいキーワードを含むか
4. curiosity（好奇心喚起）: 中身が気になり購入意欲を掻き立てるか

以下のJSON形式のみで出力してください:
[
  {"index": 0, "appeal": 8, "differentiation": 7, "seo": 6, "curiosity": 9},
  {"index": 1, "appeal": 6, "differentiation": 8, "seo": 7, "curiosity": 7},
  ...（10個）
]`,
    systemPrompt:
      'JSONのみで返してください。説明文は不要です。厳格かつ客観的に評価してください。',
    maxTokens: 4096,
  });

  // スコアリング結果を解析
  let scores: { index: number; appeal: number; differentiation: number; seo: number; curiosity: number }[] = [];
  try {
    const jsonMatch = scoringRes.text.match(/\[[\s\S]*\]/);
    scores = JSON.parse(jsonMatch ? jsonMatch[0] : scoringRes.text);
  } catch {
    // スコアリング失敗時はデフォルトスコアを適用
    scores = rawCandidates.map((_, i) => ({
      index: i,
      appeal: 5,
      differentiation: 5,
      seo: 5,
      curiosity: 5,
    }));
  }

  // 候補にスコアを統合
  const candidates: TitleCandidate[] = rawCandidates.map((raw, i) => {
    const score = scores.find((s) => s.index === i) || {
      appeal: 5,
      differentiation: 5,
      seo: 5,
      curiosity: 5,
    };
    const totalScore =
      score.appeal + score.differentiation + score.seo + score.curiosity;
    return {
      title: raw.title,
      subtitle: raw.subtitle,
      scores: {
        appeal: score.appeal,
        differentiation: score.differentiation,
        seo: score.seo,
        curiosity: score.curiosity,
      },
      totalScore,
    };
  });

  // 最高スコアのタイトルを自動採用
  candidates.sort((a, b) => b.totalScore - a.totalScore);
  const selected = candidates[0];

  sse.send({
    step: 'title',
    status: 'completed',
    message: `タイトル決定: 「${selected.title}」(スコア: ${selected.totalScore}/40)`,
  });

  return {
    candidates,
    selectedTitle: selected.title,
    selectedSubtitle: selected.subtitle,
  };
}
