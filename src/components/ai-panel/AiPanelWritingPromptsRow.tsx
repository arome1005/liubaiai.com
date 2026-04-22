import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GlobalPromptTemplate } from "../../db/types";
import {
  PROMPT_PICKER_WRITER_SLOTS,
  PROMPT_PICKER_WRITING_REQUIREMENT_TYPES,
  PROMPT_PICKER_WRITING_STYLE_TYPES,
} from "../PromptPicker";
import { GlobalPromptQuickDialog } from "../prompt-quick/GlobalPromptQuickDialog";

export type WritingPromptMode = "quick" | "custom";

export type AiPanelWritingPromptsRowProps = {
  selectedStyleTemplateId: string | null;
  selectedReqTemplateId: string | null;
  styleTemplateTitle: string | null;
  reqTemplateTitle: string | null;
  onStyleTemplatePick: (template: GlobalPromptTemplate | null) => void;
  onReqTemplatePick: (template: GlobalPromptTemplate | null) => void;
  styleMode: WritingPromptMode;
  onStyleModeChange: (mode: WritingPromptMode) => void;
  styleCustomText: string;
  onStyleCustomTextChange: (v: string) => void;
  reqMode: WritingPromptMode;
  onReqModeChange: (mode: WritingPromptMode) => void;
  reqCustomText: string;
  onReqCustomTextChange: (v: string) => void;
};

type SectionProps = {
  label: string;
  mode: WritingPromptMode;
  onModeChange: (m: WritingPromptMode) => void;
  templateTitle: string | null;
  customText: string;
  onCustomTextChange: (v: string) => void;
  onOpenPicker: () => void;
  onBrowse: () => void;
  pickerPlaceholder: string;
  customPlaceholder: string;
};

function WritingPromptSection(props: SectionProps) {
  const {
    label,
    mode,
    onModeChange,
    templateTitle,
    customText,
    onCustomTextChange,
    onOpenPicker,
    onBrowse,
    pickerPlaceholder,
    customPlaceholder,
  } = props;

  return (
    <div className="wprow-section">
      <div className="small muted" style={{ marginBottom: 5 }}>
        {label}
      </div>
      <div className="wprow-tabs">
        <button
          type="button"
          className={`wprow-tab${mode === "quick" ? " wprow-tab--active" : ""}`}
          onClick={() => onModeChange("quick")}
        >
          快捷选项
        </button>
        <button
          type="button"
          className={`wprow-tab${mode === "custom" ? " wprow-tab--active" : ""}`}
          onClick={() => onModeChange("custom")}
        >
          自定义
        </button>
        <button type="button" className="wprow-tab wprow-tab--more" onClick={onBrowse}>
          更多
        </button>
      </div>

      {mode === "quick" ? (
        <button
          type="button"
          className="wprow-selector"
          data-placeholder={!templateTitle ? "true" : undefined}
          onClick={onOpenPicker}
        >
          <span className="wprow-selector-label">
            {templateTitle || pickerPlaceholder}
          </span>
          <ChevronDown size={13} className="wprow-selector-chevron" />
        </button>
      ) : (
        <textarea
          className="wprow-custom"
          placeholder={customPlaceholder}
          value={customText}
          onChange={(e) => onCustomTextChange(e.target.value)}
          rows={3}
        />
      )}
    </div>
  );
}

/**
 * AI 侧栏「写作提示词」：文风 / 要求，带 快捷选项 / 自定义 / 更多 三标签
 */
export function AiPanelWritingPromptsRow(props: AiPanelWritingPromptsRowProps) {
  const {
    selectedStyleTemplateId,
    selectedReqTemplateId,
    styleTemplateTitle,
    reqTemplateTitle,
    onStyleTemplatePick,
    onReqTemplatePick,
    styleMode,
    onStyleModeChange,
    styleCustomText,
    onStyleCustomTextChange,
    reqMode,
    onReqModeChange,
    reqCustomText,
    onReqCustomTextChange,
  } = props;

  const navigate = useNavigate();
  const [styleOpen, setStyleOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);

  const browse = () => navigate("/prompts");

  return (
    <div className="ai-panel-writing-prompts">
      <WritingPromptSection
        label="写作风格"
        mode={styleMode}
        onModeChange={onStyleModeChange}
        templateTitle={styleTemplateTitle}
        customText={styleCustomText}
        onCustomTextChange={onStyleCustomTextChange}
        onOpenPicker={() => setStyleOpen(true)}
        onBrowse={browse}
        pickerPlaceholder="选择写作风格…"
        customPlaceholder="输入自定义写作风格要求…"
      />

      <WritingPromptSection
        label="写作要求"
        mode={reqMode}
        onModeChange={onReqModeChange}
        templateTitle={reqTemplateTitle}
        customText={reqCustomText}
        onCustomTextChange={onReqCustomTextChange}
        onOpenPicker={() => setReqOpen(true)}
        onBrowse={browse}
        pickerPlaceholder="选择写作要求…"
        customPlaceholder="输入自定义写作要求…"
      />

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
