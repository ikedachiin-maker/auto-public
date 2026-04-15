/**
 * Phase 1: 多層リサーチ
 * - 3段階並列リサーチ（Promise.all）
 * - 各段階: 市場トレンド / 競合書籍 / ペインポイント
 * - 各maxTokens: 8192
 * - 結果統合 + データポイント5つ以上抽出
 */

import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type { PipelineConfig, ResearchResult, DataPoint } from '../types';

export async function executeResearch(
  config: PipelineConfig,
  claude: ClaudeClient,
  sse: SSEManager
): Promise<ResearchResult> {
  const { theme, targetAudience } = config;

  sse.send({
    step: 'research',
    status: 'running',
    message: '多層リサーチ中... (3段階並列実行)',
  });

  // 3段階のリサーチを並列実行
  const [marketResearch, competitorAnalysis, painPointAnalysis] =
    await Promise.all([
      // Stage 1: 市場・トレンド調査
      (async () => {
        sse.send({
          step: 'research',
          status: 'running',
          message: '多層リサーチ中... (1/3) 市場・トレンド調査',
        });
        const res = await claude.call({
          prompt: `「${theme}」に関する市場・トレンド調査を実施してください。ターゲット: ${targetAudience}

以下の観点で詳細に調査・分析してください:
1. 市場規模と成長率（具体的な数値データ付き）
2. 最新のトレンドと今後の予測
3. 主要プレイヤーと市場構造
4. 消費者・読者の動向と行動変化
5. テクノロジーやツールの進化の影響

具体的な数値データ、統計、調査結果を必ず含めてください。
1000字以上で詳細にまとめてください。`,
          systemPrompt:
            '日本語で回答してください。データに基づく市場分析の専門家として、具体的な数値と根拠を示しながら分析してください。',
          maxTokens: 8192,
        });
        return res.text;
      })(),

      // Stage 2: 競合書籍分析
      (async () => {
        sse.send({
          step: 'research',
          status: 'running',
          message: '多層リサーチ中... (2/3) 競合書籍分析',
        });
        const res = await claude.call({
          prompt: `「${theme}」に関する競合書籍を分析してください。ターゲット: ${targetAudience}

以下の観点で分析してください:
1. Amazon等で人気の類書（タイトル、概要、評価）
2. 各競合書籍の強み・弱み
3. レビュー傾向（読者が評価するポイント、不満点）
4. 価格帯と販売戦略
5. 差別化ポイント（我々の書籍が提供すべき独自価値）
6. コンテンツの構成パターン（章立て、ページ数）

具体的な書籍名やデータを含めてください。
1000字以上で詳細にまとめてください。`,
          systemPrompt:
            '日本語で回答してください。出版市場アナリストとして、データに基づく客観的な分析をしてください。',
          maxTokens: 8192,
        });
        return res.text;
      })(),

      // Stage 3: ペインポイント深堀り
      (async () => {
        sse.send({
          step: 'research',
          status: 'running',
          message: '多層リサーチ中... (3/3) ペインポイント深堀り',
        });
        const res = await claude.call({
          prompt: `「${theme}」における${targetAudience}のペインポイントを深堀り調査してください。

以下を網羅してください:
1. ターゲット読者の具体的な悩み・課題（10個以上）
2. 各悩みの深刻度と優先順位
3. 現在の解決策とその限界
4. 「こうなりたい」理想像
5. 情報収集の行動パターン
6. 購買・行動の心理的障壁
7. 成功体験と失敗体験のパターン

具体的なペルソナやシナリオを交えてください。
1000字以上で詳細にまとめてください。`,
          systemPrompt:
            '日本語で回答してください。消費者心理と行動分析の専門家として、共感に基づく深い洞察を提供してください。',
          maxTokens: 8192,
        });
        return res.text;
      })(),
    ]);

  // 結果を統合してサマリーとデータポイントを生成
  const summaryRes = await claude.call({
    prompt: `以下の3つのリサーチ結果を統合し、以下の2点をJSON形式で出力してください:

1. summary: 全リサーチの統合サマリー（500字程度）
2. dataPoints: 具体的な数値データポイント（最低5つ）

## 市場・トレンド調査
${marketResearch}

## 競合書籍分析
${competitorAnalysis}

## ペインポイント分析
${painPointAnalysis}

以下のJSON形式のみで出力してください:
{
  "summary": "統合サマリーテキスト",
  "dataPoints": [
    {"fact": "具体的な数値データ", "source": "出典（あれば）", "year": "年（あれば）"},
    ...
  ]
}`,
    systemPrompt: 'JSONのみで返してください。説明文は不要です。',
    maxTokens: 4096,
  });

  let summary = '';
  let dataPoints: DataPoint[] = [];

  try {
    const jsonMatch = summaryRes.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : summaryRes.text);
    summary = parsed.summary || '';
    dataPoints = (parsed.dataPoints || []).map(
      (dp: { fact?: string; source?: string; year?: string }) => ({
        fact: dp.fact || '',
        source: dp.source,
        year: dp.year,
      })
    );
  } catch {
    // JSON解析失敗時はテキストをサマリーとして使用
    summary = summaryRes.text;
    dataPoints = [];
  }

  sse.send({
    step: 'research',
    status: 'completed',
    message: `多層リサーチ完了 (数値データ${dataPoints.length}件抽出)`,
  });

  return {
    marketResearch,
    competitorAnalysis,
    painPointAnalysis,
    summary,
    dataPoints,
  };
}
