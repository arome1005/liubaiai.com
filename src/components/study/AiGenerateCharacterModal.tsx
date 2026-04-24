import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../../ai/client";
import { isLocalAiProvider } from "../../ai/local-provider";
import { getProviderConfig, loadAiSettings, type AiSettings } from "../../ai/storage";
import type { AiProviderId } from "../../ai/types";
import type { BibleCharacter, Chapter, GlobalPromptTemplate } from "../../db/types";
import { PROMPT_SCOPE_SLOTS } from "../../db/types";
import { listCharacterPromptHotlist } from "../../util/character-prompt-hotlist";
import { aiModelIdToProvider, aiProviderToModelId } from "../../util/ai-ui-model-map";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { AI_MODELS } from "../ai-model-selector";
import { UnifiedAIModelSelector as AIModelSelector } from "../ai-model-selector-unified";
import { GlobalPromptQuickDialog } from "../prompt-quick/GlobalPromptQuickDialog";
import { CharacterPromptBrowseModal } from "./CharacterPromptBrowseModal";
import { Spinner } from "../ui/spinner";

const WRITER_SLOTS = PROMPT_SCOPE_SLOTS.writer;

const JSON_RULES = `

【输出格式要求（须严格遵守）】
请严格只输出一个 JSON 对象，不要 markdown 代码块，不要额外说明。
JSON 字段：name, motivation, relationships, voiceNotes, taboos。
其中 motivation 对应「角色信息」长描述，voiceNotes 对应「角色性格」短描述；relationships、taboos 为补充关系与禁忌。
每个字段必须是字符串。name 不超过 15 字。`;

function unwrapJsonBlock(raw: string): string {
  const s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : s;
}

export type AiGenerateCharacterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workTitle: string;
  workId: string;
  chapters: Chapter[];
  characters: BibleCharacter[];
  activeChapterId: string | null;
  /** 书斋当前选中人物，可为 null 时生成会新建 */
  selectedCharacter: BibleCharacter | null;
  /** 与书斋表单未保存态一致，生成前可提示 */
  characterFormDirty: boolean;
  onRefresh: () => void | Promise<void>;
  /** 生成并写入后，用于在书斋选中对应人物卡 */
  onCharacterGenerated?: (characterId: string) => void;
  addCharacter: (
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "createdAt" | "updatedAt">>,
  ) => Promise<BibleCharacter>;
  updateCharacter: (id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>) => Promise<void>;
};

export function AiGenerateCharacterModal(props: AiGenerateCharacterModalProps) {
  const {
    open,
    onOpenChange,
    workTitle,
    workId,
    chapters,
    characters,
    activeChapterId,
    selectedCharacter,
    characterFormDirty,
    onRefresh,
    onCharacterGenerated,
    addCharacter,
    updateCharacter,
  } = props;

  const [hotList, setHotList] = useState<GlobalPromptTemplate[]>([]);
  const [selectedHotId, setSelectedHotId] = useState<string | null>(null);
  const [pickerTemplate, setPickerTemplate] = useState<GlobalPromptTemplate | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => aiProviderToModelId(loadAiSettings().provider));
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [extraNote, setExtraNote] = useState("");
  const [running, setRunning] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const settings = useMemo(() => loadAiSettings(), [open]);

  const chapterOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const ch of chapters) m.set(ch.id, ch.order);
    return m;
  }, [chapters]);

  const activeOrder = useMemo(
    () => (activeChapterId ? chapterOrderMap.get(activeChapterId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER),
    [activeChapterId, chapterOrderMap],
  );

  const providerId = useMemo<AiProviderId>(() => aiModelIdToProvider(selectedModelId), [selectedModelId]);
  const currentModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0]!,
    [selectedModelId],
  );

  const activeTemplate = useMemo(() => {
    if (pickerTemplate) return pickerTemplate;
    return hotList.find((h) => h.id === selectedHotId) ?? null;
  }, [hotList, pickerTemplate, selectedHotId]);

  useEffect(() => {
    if (!open) {
      setQuickOpen(false);
      setBrowseOpen(false);
      return;
    }
    setSelectedModelId(aiProviderToModelId(settings.provider));
    void listCharacterPromptHotlist(5).then((list) => {
      setHotList(list);
      if (list[0]) setSelectedHotId(list[0].id);
    });
  }, [open, settings.provider]);

  const runGenerate = useCallback(async () => {
    const sourceChapters = chapters.filter((c) => (c.content ?? "").trim());
    if (sourceChapters.length === 0) {
      toast.error("当前还没有可用正文，无法根据剧情生成人物。");
      return;
    }
    if (characterFormDirty && selectedCharacter && !window.confirm("将覆盖书斋里当前未保存的编辑，是否继续？")) {
      return;
    }
    if (!activeTemplate?.body?.trim()) {
      toast.error("请从左侧热门或「选择提示词」指定一条人设类提示词。");
      return;
    }

    const sBase = loadAiSettings();
    const merged: AiSettings = { ...sBase, provider: providerId };
    if (!isLocalAiProvider(merged.provider)) {
      if (!merged.privacy.consentAccepted || !merged.privacy.allowCloudProviders) {
        toast.error("请先在设置中开启云端模型。");
        return;
      }
      if (!merged.privacy.allowChapterContent) {
        toast.error("请先在隐私设置中开启「允许正文上云」。");
        return;
      }
    }

    const config = getProviderConfig(merged, merged.provider);
    const activeOrderForPick = activeOrder === Number.MAX_SAFE_INTEGER ? 0 : activeOrder;
    const chapterContext = [...sourceChapters]
      .sort((a, b) => Math.abs(a.order - activeOrderForPick) - Math.abs(b.order - activeOrderForPick))
      .slice(0, 6)
      .map((ch) => `【第${ch.order}章 ${ch.title}】\n${(ch.content ?? "").slice(0, 1200)}`)
      .join("\n\n---\n\n");

    const current = selectedCharacter
      ? `当前角色（可重写）：\n- 名称：${selectedCharacter.name || "未命名"}\n- 角色信息：${selectedCharacter.motivation || "暂无"}\n- 角色性格：${selectedCharacter.voiceNotes || "暂无"}\n- 关系：${selectedCharacter.relationships || "暂无"}\n- 禁忌：${selectedCharacter.taboos || "暂无"}`
      : "当前没有选中人物卡，将新建一条角色并写入。";

    const systemHead = activeTemplate.body.trim();
    const systemPrompt = `${systemHead}${JSON_RULES}`;

    const userPrompt = `${current}

已有角色名称（避免重名）：${characters.map((c) => c.name).filter(Boolean).join("、") || "无"}
${extraNote.trim() ? `\n【作者补充要求】\n${extraNote.trim()}\n` : ""}
章节上下文（节选）：
${chapterContext}`;

    setRunning(true);
    let output = "";
    try {
      await generateWithProviderStream({
        provider: merged.provider,
        config,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        onDelta: (delta) => {
          output += delta;
        },
      });

      const parsed = JSON.parse(unwrapJsonBlock(output)) as Partial<{
        name: string;
        motivation: string;
        relationships: string;
        voiceNotes: string;
        taboos: string;
      }>;
      if (!(parsed.name ?? "").trim()) {
        throw new Error("AI 未返回有效角色名");
      }

      let targetId = selectedCharacter?.id ?? null;
      if (!targetId) {
        const created = await addCharacter(workId, { name: parsed.name!.trim() || "新人物" });
        targetId = created.id;
      }

      await updateCharacter(targetId, {
        name: (parsed.name ?? "").trim() || "新人物",
        motivation: (parsed.motivation ?? "").trim(),
        relationships: (parsed.relationships ?? "").trim(),
        voiceNotes: (parsed.voiceNotes ?? "").trim(),
        taboos: (parsed.taboos ?? "").trim(),
      });
      await onRefresh();
      onCharacterGenerated?.(targetId);
      toast.success("AI 已根据人设提示词与正文生成并写入书斋。");
      onOpenChange(false);
    } catch (err) {
      if (isFirstAiGateCancelledError(err)) return;
      toast.error(err instanceof Error ? err.message : "AI 生成人物失败");
    } finally {
      setRunning(false);
    }
  }, [
    activeTemplate,
    addCharacter,
    activeOrder,
    chapters,
    characterFormDirty,
    characters,
    extraNote,
    onOpenChange,
    onCharacterGenerated,
    onRefresh,
    providerId,
    selectedCharacter,
    updateCharacter,
    workId,
  ]);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && !running && onOpenChange(false)}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-[220]"
          className="z-[221] flex max-h-[min(92dvh,900px)] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
          <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">AI 生成人物</DialogTitle>
              <button
                type="button"
                className="hover:bg-accent rounded-md p-1.5"
                disabled={running}
                onClick={() => onOpenChange(false)}
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs font-normal text-muted-foreground">
              作品：{workTitle} · 从提示词库选「人设」作指令，与章节节选一并交给模型
            </p>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(0,220px)_1fr]">
            <aside className="bg-muted/20 border-b border-border/50 p-3 md:border-r md:border-b-0">
              <div className="text-xs font-medium text-muted-foreground mb-2">热门 · 人设向提示词</div>
              <ul className="max-h-[40dvh] space-y-2 overflow-auto md:max-h-[min(60dvh,520px)]">
                {hotList.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => {
                        setPickerTemplate(null);
                        setSelectedHotId(t.id);
                      }}
                      className={cn(
                        "w-full rounded-md border px-2 py-1.5 text-left text-xs leading-snug transition-colors",
                        selectedHotId === t.id && !pickerTemplate
                          ? "border-primary bg-primary/10 text-foreground"
                          : "hover:bg-accent/50 border-transparent",
                      )}
                    >
                      <span className="line-clamp-3 font-medium">{t.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full text-xs"
                disabled={running}
                onClick={() => {
                  setQuickOpen(false);
                  setBrowseOpen(true);
                }}
              >
                更多提示词
              </Button>
            </aside>

            <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">AI 模型</label>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => setModelSelectorOpen(true)}
                  className={cn(
                    "border-border/60 bg-background flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    "hover:border-primary/50 hover:bg-accent/30",
                    running && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="shrink-0 scale-90">{currentModel.icon}</span>
                  <span className="flex-1">
                    <span className="text-foreground font-medium">{currentModel.name}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">{currentModel.subtitle}</span>
                  </span>
                  <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                </button>
                <p className="text-[0.7rem] text-muted-foreground">与设置中的提供方/Key 共用，可在「设置 → AI」中修改。</p>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">提示词（提示词库 · 人设）</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={running}
                    className={cn(
                      "h-7 gap-1.5 px-2.5 text-xs",
                      activeTemplate ? "border-primary/60 bg-primary/5 text-primary" : "text-muted-foreground",
                    )}
                    onClick={() => setQuickOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="max-w-[14rem] truncate">{activeTemplate ? activeTemplate.title : "选择提示词"}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </div>
                {activeTemplate ? (
                  <p className="text-muted-foreground border-border/40 bg-muted/30 rounded-md border p-2 text-[0.72rem] leading-relaxed">
                    当前：<strong className="text-foreground">{activeTemplate.title}</strong>
                  </p>
                ) : (
                  <p className="text-destructive text-xs">请从左侧热门或上方选择一条人设类提示词</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">备注（可选）</label>
                <textarea
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  rows={3}
                  disabled={running}
                  placeholder="补充对角色生成的要求，例如：突出反派感、与某配角的关系等"
                  className="border-border/60 bg-background w-full resize-y rounded-md border px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-border/50 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <p className="text-muted-foreground m-0 max-w-[60%] text-[0.65rem]">
              以上内容均由 AI 生成，写入前请在书斋核对与正文是否一致。
            </p>
            <Button type="button" className="gap-1.5" disabled={running} onClick={() => void runGenerate()}>
              {running ? <Spinner className="size-4" /> : <Play className="size-4" />}
              {running ? "生成中…" : "开始生成"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AIModelSelector
        open={modelSelectorOpen && open}
        onOpenChange={setModelSelectorOpen}
        selectedModelId={selectedModelId}
        onSelectModel={(id) => {
          setSelectedModelId(id);
          setModelSelectorOpen(false);
        }}
        title="选择模型"
        overlayClassName="z-[222]"
        contentClassName="z-[223]"
      />

      <GlobalPromptQuickDialog
        open={quickOpen && open}
        onOpenChange={setQuickOpen}
        filterTypes={["character"]}
        filterSlots={WRITER_SLOTS}
        selectedId={activeTemplate?.id ?? null}
        activeTemplate={activeTemplate}
        onSelect={(t) => {
          setPickerTemplate(t);
          if (t) setSelectedHotId(null);
        }}
        onOpenBrowse={() => setBrowseOpen(true)}
        labels={{
          mineEmpty: "暂无自建的「人设」类提示词，可前往提示词库新建。",
          popularEmpty: "暂无人设类提示词。",
        }}
      />

      <CharacterPromptBrowseModal
        open={browseOpen && open}
        onOpenChange={setBrowseOpen}
        selectedId={activeTemplate?.id ?? null}
        onSelect={(t) => {
          setPickerTemplate(t);
          setSelectedHotId(null);
        }}
      />
    </>
  );
}
