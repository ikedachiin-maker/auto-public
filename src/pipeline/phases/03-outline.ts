/**
 * Phase 3: 章構成設計（各章3候補 -> スコアリング）
 * - ストーリーアーク: 問題提起 -> 基礎 -> 自己診断 -> 方法論 -> 事例 -> 加速 -> LINE誘導
 * - 各章テーマ3候補 -> スコアリング -> 最適選定
 * - 第7章はLINE登録誘導
 */

import type { ClaudeClient } from '../clients/claude-client';
import type { SSEManager } from '../sse-manager';
import type {
  ResearchResult,
  TitleGenerationResult,
  OutlineResult,
  Outline,
  OutlineChapter,
} from '../types';

// ストーリーアーク定義
const STORY_ARC = [
  { chapter: 1, role: '導入・問題提起', description: '読者の現状の痛みを明確化、本書で得られる変化を提示' },
  { chapter: 2, role: '基礎理論・概念', description: 'テーマの基本概念と背景知識を体系的に解説' },
  { chapter: 3, role: '深掘り・メカニズム', description: '「なぜそうなるのか」の原理を具体データで裏付け' },
  { chapter: 4, role: '実践手法', description: '具体的な方法論・ステップバイステップガイド' },
  { chapter: 5, role: 'ケーススタディ', description: '成功事例と失敗事例の分析' },
  { chapter: 6, role: '応用・発展', description: '上級テクニック、組み合わせ戦略' },
  { chapter: 7, role: 'まとめ・次のステップ・LINE誘導', description: '全体の振り返り、さらに深い学びへの橋渡し、LINE登録の自然な誘導' },
];

export async function executeOutline(
  research: ResearchResult,
  titleResult: TitleGenerationResult,
  claude: ClaudeClient,
  sse: SSEManager
): Promise<OutlineResult> {
  // Step 1: 各章3候補生成
  sse.send({
    step: 'outline',
    status: 'running',
    message: '章構成を設計中 (各章3候補生成)...',
  });

  const storyArcDescription = STORY_ARC.map(
    (a) => `第${a.chapter}章: ${a.role} — ${a.description}`
  ).join('\n');

  const candidatesRes = await claude.call({
    prompt: `以下の情報を基に、電子書籍「${titleResult.selectedTitle}」の章構成を設計してください。
各章について3パターンのテーマ候補を生成してください。

## 書籍タイトル
「${titleResult.selectedTitle}」（${titleResult.selectedSubtitle}）

## リサーチサマリー
${research.summary}

## データポイント
${research.dataPoints.map((dp) => `- ${dp.fact}`).join('\n')}

## ストーリーアーク（必ずこの構成に従ってください）
${storyArcDescription}

## 要件
- 各章のテーマ候補を3パターン生成
- 各候補にはポイント（5つ以上）を含める
- 第7章は必ずLINE登録への自然な誘導を含める
- ストーリーアーク上の役割を明示

以下のJSON形式のみで出力してください:
{
  "chapters": [
    {
      "number": 1,
      "storyArcRole": "導入・問題提起",
      "candidates": [
        {"title": "候補1のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3", "ポイント4", "ポイント5"]},
        {"title": "候補2のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3", "ポイント4", "ポイント5"]},
        {"title": "候補3のタイトル", "points": ["ポイント1", "ポイント2", "ポイント3", "ポイント4", "ポイント5"]}
      ]
    },
    ...（第7章まで）
  ]
}`,
    systemPrompt:
      'JSONのみで返してください。説明文は不要です。日本語で回答してください。',
    maxTokens: 8192,
  });

  // JSON解析
  interface CandidateChapter {
    number: number;
    storyArcRole: string;
    candidates: { title: string; points: string[] }[];
  }

  let chapterCandidatesRaw: CandidateChapter[] = [];
  try {
    const jsonMatch = candidatesRes.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : candidatesRes.text);
    chapterCandidatesRaw = parsed.chapters || [];
  } catch {
    throw new Error('章構成候補のJSON解析に失敗しました');
  }

  // Step 2: スコアリング・選定
  sse.send({
    step: 'outline',
    status: 'running',
    message: '最適な章構成をスコアリング選定中...',
  });

  const candidatesForScoring = chapterCandidatesRaw
    .map((ch) => {
      const candidatesList = ch.candidates
        .map(
          (c, i) =>
            `  候補${i + 1}: 「${c.title}」\n    ポイント: ${c.points.join(', ')}`
        )
        .join('\n');
      return `第${ch.number}章 (${ch.storyArcRole}):\n${candidatesList}`;
    })
    .join('\n\n');

  const scoringRes = await claude.call({
    prompt: `以下の章構成候補から、各章で最適な1つを選定してください。
選定基準: ストーリーアークとの整合性、読者への価値、独自性、流れの自然さ

${candidatesForScoring}

また、書籍全体の説明文（300字程度）とキーワード（最大7個）も生成してください。

以下のJSON形式のみで出力してください:
{
  "description": "書籍の内容紹介文（300字程度）",
  "keywords": ["キーワード1", "キーワード2", ...],
  "selectedIndices": [0, 2, 1, 0, 1, 2, 0]
}

selectedIndicesは各章で選ばれた候補のインデックス（0-2）です。`,
    systemPrompt:
      'JSONのみで返してください。説明文は不要です。日本語で回答してください。',
    maxTokens: 4096,
  });

  // スコアリング結果を解析
  let description = '';
  let keywords: string[] = [];
  let selectedIndices: number[] = [0, 0, 0, 0, 0, 0, 0];

  try {
    const jsonMatch = scoringRes.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : scoringRes.text);
    description = parsed.description || '';
    keywords = parsed.keywords || [];
    selectedIndices = parsed.selectedIndices || [0, 0, 0, 0, 0, 0, 0];
  } catch {
    // 解析失敗時は全て候補0を採用
  }

  // 最適な章構成を組み立てる
  const chapters: OutlineChapter[] = chapterCandidatesRaw.map((ch, i) => {
    const selectedIdx = selectedIndices[i] || 0;
    const selected = ch.candidates[selectedIdx] || ch.candidates[0];
    const arcRole = STORY_ARC[i]?.role || ch.storyArcRole || '';
    return {
      number: ch.number,
      title: selected.title,
      points: selected.points,
      storyArcRole: arcRole,
    };
  });

  // 候補を保存（参照用）
  const chapterCandidates: OutlineChapter[][] = chapterCandidatesRaw.map(
    (ch) =>
      ch.candidates.map((c, idx) => ({
        number: ch.number,
        title: c.title,
        points: c.points,
        storyArcRole: STORY_ARC[ch.number - 1]?.role || '',
      }))
  );

  const outline: Outline = {
    title: titleResult.selectedTitle,
    subtitle: titleResult.selectedSubtitle,
    description,
    keywords: keywords.slice(0, 7),
    chapters,
  };

  sse.send({
    step: 'outline',
    status: 'completed',
    message: `章構成設計完了: 「${outline.title}」全${chapters.length}章`,
  });

  return { outline, chapterCandidates };
}
