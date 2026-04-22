export function AiPanelWritingVarsSection(props: {
  storyBackground: string;
  onStoryBackgroundChange: (v: string) => void;
  characters: string;
  onCharactersChange: (v: string) => void;
  relations: string;
  onRelationsChange: (v: string) => void;
  skillPreset: "none" | "tight" | "dialogue" | "describe" | "custom";
  onSkillPresetChange: (v: "none" | "tight" | "dialogue" | "describe" | "custom") => void;
  skillText: string;
  onSkillTextChange: (v: string) => void;
  wrap?: "details" | "plain";
}) {
  const wrap = props.wrap ?? "details";
  const fields = (
    <>
      <label className="ai-panel-field">
        <span className="small muted">故事背景（可空）</span>
        <textarea
          name="storyBackground"
          value={props.storyBackground}
          onChange={(e) => props.onStoryBackgroundChange(e.target.value)}
          rows={3}
        />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">角色（可空）</span>
        <textarea name="characters" value={props.characters} onChange={(e) => props.onCharactersChange(e.target.value)} rows={3} />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">角色关系（可空）</span>
        <textarea name="relations" value={props.relations} onChange={(e) => props.onRelationsChange(e.target.value)} rows={3} />
      </label>
      <div className="ai-panel-row">
        <label className="small muted">技巧预设</label>
        <select
          name="skillPreset"
          value={props.skillPreset}
          onChange={(e) => props.onSkillPresetChange(e.target.value as "none" | "tight" | "dialogue" | "describe" | "custom")}
        >
          <option value="none">无</option>
          <option value="tight">紧凑</option>
          <option value="dialogue">对话推进</option>
          <option value="describe">画面氛围</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      {props.skillPreset === "custom" ? (
        <label className="ai-panel-field">
          <span className="small muted">自定义技巧</span>
          <textarea name="skillText" value={props.skillText} onChange={(e) => props.onSkillTextChange(e.target.value)} rows={3} />
        </label>
      ) : null}
    </>
  );

  if (wrap === "plain") {
    return <div className="ai-panel-box ai-panel-box--plain-fields">{fields}</div>;
  }

  return (
    <details className="ai-panel-box" aria-labelledby="ai-panel-writing-vars-summary">
      <summary id="ai-panel-writing-vars-summary">写作变量 · 本书默认</summary>
      {fields}
    </details>
  );
}
