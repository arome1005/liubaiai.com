import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { BibleCharacter, BibleGlossaryTerm } from "../../db/types";

function PickerDropdown(props: {
  label: string;
  placeholder: string;
  items: { id: string; label: string; title?: string }[];
  pickedIds: string[];
  onToggle: (id: string) => void;
}) {
  const { label, placeholder, items, pickedIds, onToggle } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s) || it.title?.toLowerCase().includes(s));
  }, [items, q]);

  const pickedCount = pickedIds.length;

  return (
    <div className="study-dropdown">
      <button
        type="button"
        className="wprow-selector"
        data-placeholder={pickedCount === 0 ? "true" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="wprow-selector-label">
          {pickedCount > 0 ? `已选 ${pickedCount} 个${label}` : placeholder}
        </span>
        {open
          ? <ChevronUp size={13} className="wprow-selector-chevron" />
          : <ChevronDown size={13} className="wprow-selector-chevron" />}
      </button>

      {open && (
        <div className="study-dropdown-panel">
          <input
            type="text"
            className="study-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键字筛选…"
            spellCheck={false}
            autoFocus
          />
          <div className="ai-panel-study-chips" role="list">
            {items.length === 0 ? (
              <p className="study-empty">暂无{label}，前往库中添加。</p>
            ) : filtered.length === 0 ? (
              <p className="study-empty">无匹配结果。</p>
            ) : filtered.map((it) => {
              const on = pickedIds.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  role="listitem"
                  className="ai-panel-study-chip"
                  data-on={on ? "true" : "false"}
                  title={it.title ?? it.label}
                  onClick={() => onToggle(it.id)}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
  function toggleId(id: string, cur: string[], set: (next: string[]) => void) {
    const s = new Set(cur);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set([...s]);
  }

  const charItems = useMemo(
    () => props.characters.map((c) => ({ id: c.id, label: c.name.trim() || "（未命名）" })),
    [props.characters],
  );

  const termItems = useMemo(
    () => props.glossaryTerms.map((t) => {
      const cat = t.category === "name" ? "人名" : t.category === "dead" ? "已死" : "术语";
      return { id: t.id, label: t.term.trim() || "（未命名）", title: `${t.term}（${cat}）` };
    }),
    [props.glossaryTerms],
  );

  return (
    <section className="ai-panel-section ai-panel-section--flat" aria-label="本章人物与词条">
      {/* ── 人物卡 / NPC ── */}
      <div className="wprow-section">
        <div className="wprow-tabs">
          <button
            type="button"
            className={`wprow-tab${props.characterSource === "cards" ? " wprow-tab--active" : ""}`}
            onClick={() => props.onCharacterSourceChange("cards")}
          >
            人物卡
          </button>
          <button
            type="button"
            className={`wprow-tab${props.characterSource === "npc" ? " wprow-tab--active" : ""}`}
            onClick={() => props.onCharacterSourceChange("npc")}
          >
            NPC
          </button>
        </div>

        {props.characterSource === "cards" ? (
          <PickerDropdown
            label="人物"
            placeholder="选择本章出场人物…"
            items={charItems}
            pickedIds={props.pickedCharacterIds}
            onToggle={(id) => toggleId(id, props.pickedCharacterIds, props.onPickedCharacterIdsChange)}
          />
        ) : (
          <textarea
            className="wprow-custom"
            rows={3}
            value={props.npcText}
            onChange={(e) => props.onNpcTextChange(e.target.value)}
            placeholder="手写临时角色、关系补充…"
            aria-label="本章 NPC"
          />
        )}
      </div>

      {/* ── 词条卡 ── */}
      <div className="wprow-section">
        <div className="wprow-tabs" style={{ marginBottom: 6 }}>
          <span className="wprow-tab wprow-tab--active" style={{ cursor: "default" }}>词条卡</span>
        </div>
        <PickerDropdown
          label="词条"
          placeholder="选择本章用到的词条…"
          items={termItems}
          pickedIds={props.pickedGlossaryIds}
          onToggle={(id) => toggleId(id, props.pickedGlossaryIds, props.onPickedGlossaryIdsChange)}
        />
      </div>
    </section>
  );
}
