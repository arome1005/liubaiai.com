"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, HelpCircle, Info, Loader2, Save } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  PROMPT_TYPES,
  PROMPT_TYPE_LABELS,
  type GlobalPromptTemplate,
  type PromptType,
} from "../../db/types";
import {
  PROMPT_FORM_INTRO_MAX,
  PROMPT_FORM_TITLE_MAX,
  PROMPT_FORM_USAGE_MAX,
} from "../../util/prompt-form-limits";
import { PromptTypeGrid } from "./PromptTypeGrid";

/** 全屏编辑主列：显著宽于原 max-w-3xl，贴近参考站大内容区；与提示词库页 max-w-6xl 同量级 */
const FORM_OUTER = "mx-auto w-full max-w-5xl px-4 sm:px-6 lg:max-w-6xl 2xl:max-w-7xl xl:px-8";
const FORM_INNER = "rounded-2xl border border-border/50 bg-card/40 p-5 shadow-sm sm:p-7 lg:p-8 dark:bg-zinc-950/40";

type Privacy = "self" | "public";

function parseTags(raw: string): string[] {
  return raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
}

type Props = {
  mode: "new" | "edit";
  initial?: GlobalPromptTemplate | null;
  saving: boolean;
  onSave: (payload: {
    title: string;
    type: PromptType;
    tags: string[];
    intro: string;
    body: string;
    usageMethod: string;
    status: GlobalPromptTemplate["status"];
  }) => void;
};

export function PromptFormFullPage(props: Props) {
  const { mode, initial, saving, onSave } = props;
  const [title, setTitle] = useState("");
  const [type, setType] = useState<PromptType>("continue");
  const [tagsInput, setTagsInput] = useState("");
  const [intro, setIntro] = useState("");
  const [body, setBody] = useState("");
  const [usageMethod, setUsageMethod] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("self");
  const [introTouched, setIntroTouched] = useState(false);
  const [bodyError, setBodyError] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const idIntro = useId();
  const idBody = useId();

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setType(initial.type);
      setTagsInput(initial.tags.join("，"));
      setIntro(initial.intro ?? "");
      setBody(initial.body);
      setUsageMethod(initial.usageMethod ?? "");
      if (initial.status === "submitted" || initial.status === "approved") {
        setPrivacy("public");
      } else {
        setPrivacy("self");
      }
    } else {
      setTitle("");
      setType("continue");
      setTagsInput("");
      setIntro("");
      setBody("");
      setUsageMethod("");
      setPrivacy("self");
    }
    setIntroTouched(false);
    setBodyError(false);
  }, [initial, mode]);

  const handleSubmit = useCallback(() => {
    if (!body.trim()) {
      setBodyError(true);
      bodyRef.current?.focus();
      return;
    }
    if (!intro.trim()) {
      setIntroTouched(true);
      return;
    }
    setBodyError(false);
    const status: GlobalPromptTemplate["status"] =
      mode === "edit" && initial
        ? initial.status === "rejected"
          ? "submitted"
          : initial.status
        : privacy === "self"
          ? "draft"
          : "submitted";
    onSave({
      title: title.trim() || "未命名模板",
      type,
      tags: parseTags(tagsInput),
      intro: intro.trim(),
      body: body.trim(),
      usageMethod: usageMethod.trim(),
      status,
    });
  }, [body, initial, intro, mode, onSave, privacy, tagsInput, title, type, usageMethod]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) handleSubmit();
      }
    },
    [handleSubmit, saving],
  );

  const pageTitle = mode === "new" ? "新建提示词" : "编辑提示词";

  return (
    <div
      className="flex min-h-0 min-h-[calc(100dvh-8rem)] flex-1 flex-col"
      onKeyDown={onKeyDown}
    >
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className={cn("flex items-center justify-between gap-2", FORM_OUTER)}>
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link to="/prompts" aria-label="返回提示词库">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="truncate text-base font-semibold sm:text-lg">{pageTitle}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button type="button" variant="ghost" asChild>
              <Link to="/prompts">取消</Link>
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={saving}
              onClick={() => void handleSubmit()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "保存中…" : mode === "new" ? "创建" : "保存"}
            </Button>
          </div>
        </div>
        <p className={cn("mt-1 pl-10 text-[11px] text-muted-foreground sm:pl-11", FORM_OUTER)}>
          列表中仅展示「介绍」，正文用于装配/模型；不会出现在卡片上。
        </p>
      </header>

      <div className={cn("flex-1 space-y-0 overflow-y-auto py-6 sm:py-8", FORM_OUTER)}>
        <div className={cn("space-y-8", FORM_INNER)}>
        {/* 名称 */}
        <section>
          <div className="mb-1.5 flex items-center gap-1">
            <span
              className="inline-block h-4 w-0.5 rounded-sm bg-primary"
              aria-hidden
            />
            <h2 className="text-sm font-medium">提示词名称</h2>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">请简单注明功能，可罗列关键词</p>
          <div className="relative">
            <Input
              maxLength={PROMPT_FORM_TITLE_MAX}
              placeholder="给这条提示词起个名字"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <span className="absolute bottom-1.5 right-2.5 text-[10px] tabular-nums text-muted-foreground">
              {title.length} / {PROMPT_FORM_TITLE_MAX}
            </span>
          </div>
        </section>

        {/* 类型 */}
        <section>
          <p className="mb-1.5 text-sm font-medium">类型</p>
          <p className="mb-2 text-xs text-muted-foreground">与库内筛选一致，请正确选择</p>
          <PromptTypeGrid value={type} onChange={setType} />
        </section>

        {/* 标签 */}
        <section>
          <p className="mb-1.5 text-sm font-medium">
            标签 <span className="font-normal text-muted-foreground">逗号分隔</span>
          </p>
          <Input
            placeholder="爽文，升级，逆袭…"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </section>

        {/* 提示词介绍（仅列表展示，不漏正文） */}
        <section>
          <div className="mb-1 flex items-center gap-1.5">
            <label
              className="text-sm font-medium"
              id={`${idIntro}-label`}
              htmlFor={idIntro}
            >
              提示词介绍
            </label>
            <span className="text-destructive" aria-hidden>
              *
            </span>
            <span className="inline-flex items-center gap-0.5 text-muted-foreground" title="可含 Markdown">
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">建议写简单介绍与生成效果示例，对外可见</p>
          <Textarea
            id={idIntro}
            className="min-h-[8rem] resize-y font-sans text-sm leading-relaxed"
            placeholder="例如：参考《遮天》的文笔，输出偏热血升级节奏…"
            value={intro}
            maxLength={PROMPT_FORM_INTRO_MAX}
            onChange={(e) => {
              setIntro(e.target.value);
              if (e.target.value.trim()) setIntroTouched(false);
            }}
            onBlur={() => {
              if (!intro.trim()) setIntroTouched(true);
            }}
            aria-invalid={introTouched && !intro.trim()}
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>支持 Markdown 格式</span>
            <span>
              {intro.length} / {PROMPT_FORM_INTRO_MAX}
            </span>
          </div>
          {introTouched && !intro.trim() && (
            <p className="mt-1 text-xs text-destructive">请填写介绍（列表中仅展示本段，不展示正文）</p>
          )}
        </section>

        <div
          className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-foreground/90"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p>自用不强制提交审核；若希望出现在「精选」并供他人检索，请认真填写名称和介绍。正文始终不在库列表中展示。</p>
        </div>

        {/* 隐私与发布去向 */}
        {mode === "new" && (
          <section>
            <p className="mb-0.5 text-sm font-medium">可见范围</p>
            <p className="mb-3 text-xs text-muted-foreground">选择后决定初始状态；创建后仍可在个人中心中调整</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPrivacy("self")}
                className={cn(
                  "rounded-xl border-2 p-3.5 text-left text-sm transition-colors",
                  privacy === "self"
                    ? "border-emerald-500/70 bg-emerald-500/10"
                    : "border-border bg-card/50 hover:border-muted-foreground/30",
                )}
              >
                <p className="mb-0.5 font-medium">仅自用</p>
                <p className="text-xs text-muted-foreground">先存为草稿，不进入精选池</p>
              </button>
              <button
                type="button"
                onClick={() => setPrivacy("public")}
                className={cn(
                  "rounded-xl border-2 p-3.5 text-left text-sm transition-colors",
                  privacy === "public"
                    ? "border-emerald-500/70 bg-emerald-500/10"
                    : "border-border bg-card/50 hover:border-muted-foreground/30",
                )}
              >
                <p className="mb-0.5 font-medium">申请公开到精选</p>
                <p className="text-xs text-muted-foreground">以「待审核」提交，通过后他人可见介绍与可装配</p>
              </button>
            </div>
          </section>
        )}

        {/* 正文（核心、不列于卡片） */}
        <section>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className="inline-block h-4 w-0.5 rounded-sm bg-emerald-600/80"
              aria-hidden
            />
            <label
              className="text-sm font-medium"
              id={`${idBody}-label`}
              htmlFor={idBody}
            >
              提示词正文
            </label>
            <span className="text-destructive" aria-hidden>
              *
            </span>
            <span className="text-xs text-muted-foreground">发送给模型，不在库中展示</span>
          </div>
          <Textarea
            ref={bodyRef}
            id={idBody}
            className={cn(
              "min-h-[14rem] w-full resize-y text-sm",
              bodyError && "border-destructive",
            )}
            placeholder="在这里输入要装配到侧栏/模型的完整提示词内容…"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (e.target.value.trim()) setBodyError(false);
            }}
          />
          {bodyError && <p className="mt-1 text-xs text-destructive">请填写提示词正文</p>}
        </section>

        {/* 使用方法 */}
        <section>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className="inline-block h-4 w-0.5 rounded-sm bg-amber-500/80"
              aria-hidden
            />
            <h2 className="text-sm font-medium">使用方法</h2>
            <span className="text-xs text-muted-foreground">可选</span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">简要说明如何套用到自己的作品</p>
          <div className="relative">
            <Input
              maxLength={PROMPT_FORM_USAGE_MAX}
              placeholder="例：将 [角色名] 替换为具体人名后粘贴到侧栏"
              value={usageMethod}
              onChange={(e) => setUsageMethod(e.target.value)}
            />
            <span className="absolute bottom-1.5 right-2.5 text-[10px] tabular-nums text-muted-foreground">
              {usageMethod.length} / {PROMPT_FORM_USAGE_MAX}
            </span>
          </div>
        </section>

        <p className="text-center text-[10px] text-muted-foreground/80">
          共 {PROMPT_TYPES.length} 种标准类型，与词库侧栏筛选一致（{PROMPT_TYPES.map((p) => PROMPT_TYPE_LABELS[p]).join("、")}）。
        </p>
        </div>
      </div>
    </div>
  );
}
