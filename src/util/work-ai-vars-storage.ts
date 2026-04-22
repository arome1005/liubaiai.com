import type { AiPanelWorkWritingVars } from "../components/ai-panel/types";

const KEY_PREFIX = "liubai:workAiWritingVars:";

const SKILL_PRESETS = ["none", "tight", "dialogue", "describe", "custom"] as const;

export function defaultWorkAiWritingVars(): AiPanelWorkWritingVars {
  return {
    storyBackground: "",
    characters: "",
    relations: "",
    skillPreset: "none",
    skillText: "",
  };
}

export function loadWorkAiWritingVars(workId: string): AiPanelWorkWritingVars {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + workId);
    if (!raw) return defaultWorkAiWritingVars();
    const p = JSON.parse(raw) as Record<string, unknown>;
    const base = defaultWorkAiWritingVars();
    const sp = p.skillPreset;
    const skillPreset =
      typeof sp === "string" && (SKILL_PRESETS as readonly string[]).includes(sp)
        ? (sp as AiPanelWorkWritingVars["skillPreset"])
        : base.skillPreset;
    return {
      storyBackground: typeof p.storyBackground === "string" ? p.storyBackground : base.storyBackground,
      characters: typeof p.characters === "string" ? p.characters : base.characters,
      relations: typeof p.relations === "string" ? p.relations : base.relations,
      skillPreset,
      skillText: typeof p.skillText === "string" ? p.skillText : base.skillText,
    };
  } catch {
    return defaultWorkAiWritingVars();
  }
}

export function persistWorkAiWritingVars(workId: string, vars: AiPanelWorkWritingVars): void {
  try {
    localStorage.setItem(KEY_PREFIX + workId, JSON.stringify(vars));
  } catch {
    /* quota / private mode */
  }
}
