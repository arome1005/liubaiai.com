import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
} from "../db/types";

export function buildBibleMarkdownExport(opts: {
  workTitle: string;
  characters: BibleCharacter[];
  world: BibleWorldEntry[];
  foreshadow: BibleForeshadow[];
  timeline: BibleTimelineEvent[];
  templates: BibleChapterTemplate[];
  glossary: BibleGlossaryTerm[];
}): string {
  const lines: string[] = [`# ${opts.workTitle} · 创作圣经`, "", `导出时间：${new Date().toISOString()}`, ""];

  lines.push("## 人物卡", "");
  if (opts.characters.length === 0) lines.push("（暂无）", "");
  else {
    for (const c of opts.characters) {
      lines.push(`### ${c.name}`, "");
      if (c.motivation.trim()) lines.push("**动机**", "", c.motivation, "");
      if (c.relationships.trim()) lines.push("**关系**", "", c.relationships, "");
      if (c.voiceNotes.trim()) lines.push("**口吻**", "", c.voiceNotes, "");
      if (c.taboos.trim()) lines.push("**禁忌**", "", c.taboos, "");
      lines.push("---", "");
    }
  }

  lines.push("## 世界观条目", "");
  if (opts.world.length === 0) lines.push("（暂无）", "");
  else {
    for (const w of opts.world) {
      lines.push(`### [${w.entryKind}] ${w.title}`, "", w.body || "（无正文）", "", "---", "");
    }
  }

  lines.push("## 伏笔", "");
  if (opts.foreshadow.length === 0) lines.push("（暂无）", "");
  else {
    for (const f of opts.foreshadow) {
      lines.push(`### ${f.title} · ${f.status}`, "");
      if (f.plantedWhere.trim()) lines.push("- 埋设：", f.plantedWhere, "");
      if (f.plannedResolve.trim()) lines.push("- 计划回收：", f.plannedResolve, "");
      if (f.note.trim()) lines.push("- 备注：", f.note, "");
      lines.push("---", "");
    }
  }

  lines.push("## 时间线", "");
  if (opts.timeline.length === 0) lines.push("（暂无）", "");
  else {
    for (const e of opts.timeline) {
      lines.push(`- **${e.label}**`, e.note ? `  ${e.note}` : "", "");
    }
  }

  lines.push("", "## 章头/章尾模板", "");
  if (opts.templates.length === 0) lines.push("（暂无）", "");
  else {
    for (const t of opts.templates) {
      lines.push(`### ${t.name}`, "");
      if (t.goalText.trim()) lines.push("**本章目标**", "", t.goalText, "");
      if (t.forbidText.trim()) lines.push("**禁止**", "", t.forbidText, "");
      if (t.povText.trim()) lines.push("**视角**", "", t.povText, "");
      lines.push("---", "");
    }
  }

  lines.push("", "## 术语 / 人名表", "");
  if (opts.glossary.length === 0) lines.push("（暂无）", "");
  else {
    for (const g of opts.glossary) {
      const tag =
        g.category === "dead" ? "已死" : g.category === "name" ? "人名" : "术语";
      lines.push(`- **${g.term}**（${tag}）`, g.note ? `  ${g.note}` : "", "");
    }
  }

  return lines.join("\n").trim() + "\n";
}
