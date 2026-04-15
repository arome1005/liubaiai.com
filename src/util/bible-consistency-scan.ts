/**
 * 推演 · 一致性扫描（步 32 MVP）：正文 vs 锦囊/风格卡规则，纯本地规则、无 LLM。
 */

export type ConsistencySeverity = "warn" | "info";

export type ConsistencyAlert = {
  severity: ConsistencySeverity;
  /** 稳定分类，便于后续接 AI 或过滤 */
  code: "chapter_forbid" | "style_banned" | "glossary_dead" | "character_taboo";
  message: string;
  /** 命中的短语（截断展示） */
  snippet?: string;
};

export type BibleConsistencyScanInput = {
  chapterContent: string;
  /** 本章锦囊 · forbidText */
  chapterBibleForbid: string;
  /** 作品风格卡 · bannedPhrases */
  styleBannedPhrases: string;
  glossaryTerms: readonly { term: string; category: "name" | "term" | "dead" }[];
  /** 人物名 + 禁忌自由文本（多行/顿号分隔） */
  characterTaboos: readonly { name: string; taboos: string }[];
};

function norm(s: string): string {
  return s.trim();
}

/** 从约束字段拆出短语（换行、逗号顿号分号竖线） */
export function splitConstraintPhrases(s: string): string[] {
  const parts = s
    .split(/[\r\n,，、;；|｜]+/u)
    .map(norm)
    .filter((x) => x.length >= 2);
  return [...new Set(parts)];
}

function contentHas(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const hasLatin = /[a-zA-Z]/.test(needle);
  if (hasLatin) {
    return haystack.toLowerCase().includes(needle.toLowerCase());
  }
  return haystack.includes(needle);
}

export function runBibleConsistencyScan(input: BibleConsistencyScanInput): ConsistencyAlert[] {
  const content = input.chapterContent ?? "";
  const alerts: ConsistencyAlert[] = [];

  for (const phrase of splitConstraintPhrases(input.chapterBibleForbid)) {
    if (contentHas(content, phrase)) {
      alerts.push({
        severity: "warn",
        code: "chapter_forbid",
        message: "本章「禁写 / 避免」列表中有条目出现在正文，请核对是否违反本章约束。",
        snippet: phrase.length > 100 ? phrase.slice(0, 100) + "…" : phrase,
      });
    }
  }

  for (const phrase of splitConstraintPhrases(input.styleBannedPhrases)) {
    if (contentHas(content, phrase)) {
      alerts.push({
        severity: "warn",
        code: "style_banned",
        message: "全书风格卡「禁用套话」中有条目出现在正文。",
        snippet: phrase.length > 100 ? phrase.slice(0, 100) + "…" : phrase,
      });
    }
  }

  for (const g of input.glossaryTerms) {
    const t = g.term.trim();
    if (t.length < 2) continue;
    if (g.category !== "dead") continue;
    if (contentHas(content, t)) {
      alerts.push({
        severity: "warn",
        code: "glossary_dead",
        message:
          "术语表中该条目标记为「已死」，但本章正文仍出现；若为回忆/他人转述请忽略本提示。",
        snippet: t.length > 80 ? t.slice(0, 80) + "…" : t,
      });
    }
  }

  for (const c of input.characterTaboos) {
    const name = c.name.trim() || "未命名";
    for (const line of splitConstraintPhrases(c.taboos)) {
      if (contentHas(content, line)) {
        alerts.push({
          severity: "info",
          code: "character_taboo",
          message: `人物「${name}」的禁忌表述出现在正文（可能是台词或他人评价，请人工判断）。`,
          snippet: line.length > 100 ? line.slice(0, 100) + "…" : line,
        });
      }
    }
  }

  return alerts;
}
