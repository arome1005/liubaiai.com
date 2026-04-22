import type { WritingSkillMode } from "../../ai/assemble-context";

export function AiPanelRunModeSection(props: {
  mode: WritingSkillMode;
  onModeChange: (m: WritingSkillMode) => void;
}) {
  return (
    <section className="ai-panel-section ai-panel-section--flat" aria-labelledby="ai-panel-mode-h">
      <h3 id="ai-panel-mode-h" className="ai-panel-section-title">
        运行模式
      </h3>
      <div className="ai-panel-row ai-panel-row--flush">
        <label className="small muted">模式</label>
        <select name="aiMode" value={props.mode} onChange={(e) => props.onModeChange(e.target.value as WritingSkillMode)}>
          <option value="continue">续写</option>
          <option value="rewrite">改写</option>
          <option value="outline">大纲</option>
          <option value="summarize">事实总结</option>
          <option value="draw">抽卡（无提示词）</option>
        </select>
      </div>
    </section>
  );
}
