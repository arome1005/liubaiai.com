import type { AiPanelWorkStyle, AiPanelWorkStylePatch } from "./types";

export function AiPanelStyleCardSection(props: {
  workStyle: AiPanelWorkStyle;
  onUpdateWorkStyle: (patch: AiPanelWorkStylePatch) => void;
  /** `plain`：仅表单区，由外层 `<details>` 提供折叠标题（设定 Tab 手风琴） */
  wrap?: "details" | "plain";
}) {
  const ws = props.workStyle;
  const wrap = props.wrap ?? "details";
  const fields = (
    <>
      <label className="ai-panel-field">
        <span className="small muted">叙述视角 / 人称（可空）</span>
        <textarea
          name="stylePov"
          value={ws.pov}
          onChange={(e) => props.onUpdateWorkStyle({ pov: e.target.value })}
          rows={2}
          placeholder="例如：第三人称有限 · 贴近主角内心；过去时/现在时…"
        />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">整体调性（可空）</span>
        <textarea
          name="styleTone"
          value={ws.tone}
          onChange={(e) => props.onUpdateWorkStyle({ tone: e.target.value })}
          rows={2}
          placeholder="例如：克制冷峻、少解释、多动作；偏硬核；节奏快…"
        />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">禁用词 / 禁用套话（换行分隔，可空）</span>
        <textarea
          name="styleBannedPhrases"
          value={ws.bannedPhrases}
          onChange={(e) => props.onUpdateWorkStyle({ bannedPhrases: e.target.value })}
          rows={3}
          placeholder="例如：不由得、顿时、旋即、仿佛、不可思议…"
        />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">文风锚点（短样例，可空）</span>
        <textarea
          name="styleAnchor"
          value={ws.styleAnchor}
          onChange={(e) => props.onUpdateWorkStyle({ styleAnchor: e.target.value })}
          rows={4}
          placeholder="粘贴一小段你满意的成稿，用来锁句式与节奏。"
        />
      </label>
      <label className="ai-panel-field">
        <span className="small muted">额外硬约束（可空）</span>
        <textarea
          name="styleExtraRules"
          value={ws.extraRules}
          onChange={(e) => props.onUpdateWorkStyle({ extraRules: e.target.value })}
          rows={3}
          placeholder="例如：避免上帝视角；不要出现现代网络词；对话不加引号…"
        />
      </label>

      <details style={{ marginTop: "0.5rem" }}>
        <summary className="small muted" style={{ cursor: "pointer", userSelect: "none" }}>
          高级风格指纹（展开设置）
        </summary>
        <div style={{ paddingTop: "0.5rem" }}>
          <label className="ai-panel-field">
            <span className="small muted">句节奏（可空）</span>
            <textarea
              name="styleSentenceRhythm"
              value={ws.sentenceRhythm ?? ""}
              onChange={(e) => props.onUpdateWorkStyle({ sentenceRhythm: e.target.value || undefined })}
              rows={2}
              placeholder="例如：多用短句，节奏急促；长句收尾营造余韵…"
            />
          </label>
          <label className="ai-panel-field">
            <span className="small muted">标点偏好（可空）</span>
            <textarea
              name="stylePunctuationStyle"
              value={ws.punctuationStyle ?? ""}
              onChange={(e) => props.onUpdateWorkStyle({ punctuationStyle: e.target.value || undefined })}
              rows={2}
              placeholder="例如：善用破折号表停顿，少用感叹号…"
            />
          </label>
          <label className="ai-panel-field">
            <span className="small muted">对话密度</span>
            <select
              value={ws.dialogueDensity ?? ""}
              onChange={(e) =>
                props.onUpdateWorkStyle({ dialogueDensity: (e.target.value as "low" | "medium" | "high") || undefined })
              }
            >
              <option value="">不指定</option>
              <option value="low">低（叙述/动作为主）</option>
              <option value="medium">中等</option>
              <option value="high">高（对话推动情节）</option>
            </select>
          </label>
          <label className="ai-panel-field">
            <span className="small muted">情绪温度</span>
            <select
              value={ws.emotionStyle ?? ""}
              onChange={(e) =>
                props.onUpdateWorkStyle({ emotionStyle: (e.target.value as "cold" | "neutral" | "warm") || undefined })
              }
            >
              <option value="">不指定</option>
              <option value="cold">冷峻克制（情绪内化）</option>
              <option value="neutral">适中</option>
              <option value="warm">热烈（意象丰富）</option>
            </select>
          </label>
          <label className="ai-panel-field">
            <span className="small muted">叙述距离</span>
            <select
              value={ws.narrativeDistance ?? ""}
              onChange={(e) =>
                props.onUpdateWorkStyle({
                  narrativeDistance: (e.target.value as "omniscient" | "limited" | "deep_pov") || undefined,
                })
              }
            >
              <option value="">不指定</option>
              <option value="omniscient">全知叙述</option>
              <option value="limited">第三人称有限视角</option>
              <option value="deep_pov">深度视角（贴近意识流）</option>
            </select>
          </label>
        </div>
      </details>
    </>
  );

  if (wrap === "plain") {
    return <div className="ai-panel-box ai-panel-box--plain-fields">{fields}</div>;
  }

  return (
    <details className="ai-panel-box" aria-labelledby="ai-panel-style-card-summary">
      <summary id="ai-panel-style-card-summary">全书风格卡 · 本书默认（全书级）</summary>
      {fields}
    </details>
  );
}
