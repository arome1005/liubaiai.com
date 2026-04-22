import { useMemo, useState } from "react";
import type { BibleCharacter, BibleGlossaryTerm } from "../../db/types";

const CHAR_PLACEHOLDER =
  "只勾选本章会出场、会被对白点到名的角色；不会落笔的不必选，少占上下文更省字。\n\n在此输入关键字可筛选列表（可选）。";
const TERM_PLACEHOLDER =
  "只勾选本章写法里用得到的专有名词/称谓；用不到的别堆满，上下文更干净。\n\n在此输入关键字可筛选列表（可选）。";

export function AiPanelStudyChapterSection(props: {
  characters: BibleCharacter[];
  glossaryTerms: BibleGlossaryTerm[];
  characterSource: "cards" | "npc";
  onCharacterSourceChange: (m: "cards" | "npc") => void;
  npcText: string;
  onNpcTextChange: (s: string) => void;
  pickedCharacterIds: string[];
  onPickedCharacterIdsChange: (next: string[]) => void;
  pickedGlossaryIds: string[];
  onPickedGlossaryIdsChange: (next: string[]) => void;
}) {
  const [qChar, setQChar] = useState("");
  const [qTerm, setQTerm] = useState("");

  const filteredCharacters = useMemo(() => {
    const q = qChar.trim().toLowerCase();
    if (!q) return props.characters;
    return props.characters.filter((c) => {
      const blob = `${c.name}\n${c.motivation}\n${c.relationships}\n${c.voiceNotes}\n${c.taboos}`.toLowerCase();
      return blob.includes(q);
    });
  }, [props.characters, qChar]);

  const filteredTerms = useMemo(() => {
    const q = qTerm.trim().toLowerCase();
    if (!q) return props.glossaryTerms;
    return props.glossaryTerms.filter((t) => `${t.term}\n${t.note}`.toLowerCase().includes(q));
  }, [props.glossaryTerms, qTerm]);

  function toggleId(id: string, cur: string[], set: (next: string[]) => void) {
    const s = new Set(cur);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set([...s]);
  }

  return (
    <section className="ai-panel-section ai-panel-section--flat" aria-label="本章人物与词条">
      <div className="ai-panel-row ai-panel-row--flush" style={{ alignItems: "flex-start" }}>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="ai-panel-study-pill"
            data-on={props.characterSource === "cards" ? "true" : "false"}
            onClick={() => props.onCharacterSourceChange("cards")}
          >
            人物卡
          </button>
          <button
            type="button"
            className="ai-panel-study-pill"
            data-on={props.characterSource === "npc" ? "true" : "false"}
            onClick={() => props.onCharacterSourceChange("npc")}
          >
            NPC
          </button>
        </div>
      </div>

      {props.characterSource === "cards" ? (
        <>
          <label className="ai-panel-field ai-panel-study-pick-field">
            <textarea
              value={qChar}
              onChange={(e) => setQChar(e.target.value)}
              placeholder={CHAR_PLACEHOLDER}
              rows={4}
              spellCheck={false}
              aria-label="人物卡：说明与筛选关键字"
            />
          </label>
          <div className="ai-panel-study-chips" role="list">
            {filteredCharacters.map((c) => {
              const on = props.pickedCharacterIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="listitem"
                  className="ai-panel-study-chip truncate"
                  data-on={on ? "true" : "false"}
                  title={c.name}
                  onClick={() => toggleId(c.id, props.pickedCharacterIds, props.onPickedCharacterIdsChange)}
                >
                  {c.name.trim() || "（未命名）"}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <textarea
          className="ai-panel-study-npc"
          rows={3}
          value={props.npcText}
          onChange={(e) => props.onNpcTextChange(e.target.value)}
          placeholder="手写临时角色、关系补充…"
          aria-label="本章 NPC"
        />
      )}

      <div className="ai-panel-study-split">
        <div className="ai-panel-row ai-panel-row--flush" style={{ alignItems: "center" }}>
          <span className="small muted" style={{ paddingTop: 1 }}>
            词条卡
          </span>
        </div>
        <label className="ai-panel-field ai-panel-study-pick-field">
          <textarea
            value={qTerm}
            onChange={(e) => setQTerm(e.target.value)}
            placeholder={TERM_PLACEHOLDER}
            rows={4}
            spellCheck={false}
            aria-label="词条卡：说明与筛选关键字"
          />
        </label>
        <div className="ai-panel-study-chips" role="list">
          {filteredTerms.map((t) => {
            const on = props.pickedGlossaryIds.includes(t.id);
            const cat = t.category === "name" ? "人名" : t.category === "dead" ? "已死" : "术语";
            return (
              <button
                key={t.id}
                type="button"
                role="listitem"
                className="ai-panel-study-chip truncate"
                data-on={on ? "true" : "false"}
                title={`${t.term}（${cat}）`}
                onClick={() => toggleId(t.id, props.pickedGlossaryIds, props.onPickedGlossaryIdsChange)}
              >
                {t.term.trim() || "（未命名）"}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
