import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GlobalPromptTemplate } from "../../db/types";
import {
  PROMPT_PICKER_WRITER_SLOTS,
  PROMPT_PICKER_WRITING_REQUIREMENT_TYPES,
  PROMPT_PICKER_WRITING_STYLE_TYPES,
} from "../PromptPicker";
import { GlobalPromptQuickDialog } from "../prompt-quick/GlobalPromptQuickDialog";

export type AiPanelWritingPromptsRowProps = {
  /** 当前选中的文风模板 id（用于快捷窗高亮） */
  selectedStyleTemplateId: string | null;
  /** 当前选中的要求模板 id */
  selectedReqTemplateId: string | null;
  /** 展示在按钮上的标题（选词后） */
  styleTemplateTitle: string | null;
  reqTemplateTitle: string | null;
  onStyleTemplatePick: (template: GlobalPromptTemplate | null) => void;
  onReqTemplatePick: (template: GlobalPromptTemplate | null) => void;
};

/**
 * AI 侧栏「写作提示词」：文风 / 要求，与文章概要批量选词同套快捷窗交互
 */
export function AiPanelWritingPromptsRow(props: AiPanelWritingPromptsRowProps) {
  const {
    selectedStyleTemplateId,
    selectedReqTemplateId,
    styleTemplateTitle,
    reqTemplateTitle,
    onStyleTemplatePick,
    onReqTemplatePick,
  } = props;

  const navigate = useNavigate();
  const [styleOpen, setStyleOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);

  const browse = () => navigate("/prompts");

  return (
    <div className="ai-panel-writing-prompts">
      <div className="small muted" style={{ marginBottom: 6 }}>
        写作提示词
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn" onClick={() => setStyleOpen(true)} title="从提示词库选择写作风格类模板">
          文风
          {styleTemplateTitle ? (
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              · {styleTemplateTitle.length > 14 ? `${styleTemplateTitle.slice(0, 14)}…` : styleTemplateTitle}
            </span>
          ) : null}
        </button>
        <button type="button" className="btn" onClick={() => setReqOpen(true)} title="从提示词库选择续写/开篇/人设/世界观等要求类模板">
          要求
          {reqTemplateTitle ? (
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              · {reqTemplateTitle.length > 14 ? `${reqTemplateTitle.slice(0, 14)}…` : reqTemplateTitle}
            </span>
          ) : null}
        </button>
      </div>

      <GlobalPromptQuickDialog
        open={styleOpen}
        onOpenChange={setStyleOpen}
        filterTypes={PROMPT_PICKER_WRITING_STYLE_TYPES}
        filterSlots={PROMPT_PICKER_WRITER_SLOTS}
        selectedId={selectedStyleTemplateId}
        onSelect={(t) => {
          onStyleTemplatePick(t);
          setStyleOpen(false);
        }}
        onOpenBrowse={() => {
          setStyleOpen(false);
          browse();
        }}
        labels={{
          mineEmpty: "暂无自建「写作风格」类提示词。",
          popularEmpty: "暂无可用写作风格提示词。",
        }}
      />

      <GlobalPromptQuickDialog
        open={reqOpen}
        onOpenChange={setReqOpen}
        filterTypes={PROMPT_PICKER_WRITING_REQUIREMENT_TYPES}
        filterSlots={PROMPT_PICKER_WRITER_SLOTS}
        selectedId={selectedReqTemplateId}
        onSelect={(t) => {
          onReqTemplatePick(t);
          setReqOpen(false);
        }}
        onOpenBrowse={() => {
          setReqOpen(false);
          browse();
        }}
        labels={{
          mineEmpty: "暂无自建「续写/开篇/人设/世界观」类提示词。",
          popularEmpty: "暂无可用要求类提示词。",
        }}
      />
    </div>
  );
}
