import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Loader2 } from "lucide-react";
import { generateWithProvider, isFirstAiGateCancelledError } from "../ai/client";
import { getProviderConfig, loadAiSettings } from "../ai/storage";
import type { AiSettings } from "../ai/types";
import { getWork, updateWork } from "../db/repo";
import { readLastWorkId } from "../util/lastWorkId";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { cn } from "../lib/utils";

const MODES = ["book-title", "blurb", "names"] as const;
type GeneratorMode = (typeof MODES)[number];

function isGeneratorMode(s: string | undefined): s is GeneratorMode {
  return s !== undefined && (MODES as readonly string[]).includes(s);
}

const MODE_META: Record<
  GeneratorMode,
  { title: string; hint: string; system: string; inputPlaceholder: string }
> = {
  "book-title": {
    title: "书名生成器",
    hint: "按题材与梗概批量产出书名备选；可写入当前作品书名。",
    system: `你是华语网络小说与出版领域的书名策划助手。根据用户给出的题材、人设、核心梗与风格偏好，生成 12～18 个书名备选。
要求：每个书名单独一行；不要编号；不要解释；不要引号；风格贴合用户描述；避免与常见大热书名完全雷同。`,
    inputPlaceholder: "题材、主角与关系、核心梗、希望的气质（如：冷感仙侠、治愈日常、悬疑反转）…",
  },
  blurb: {
    title: "简介生成器",
    hint: "按设定生成作品简介/文案；可写入当前作品简介。",
    system: `你是作品文案编辑。根据用户提供的设定与卖点，写 1～3 段作品简介（适合平台展示），总字数约 150～400 字。
要求：有钩子、信息密度高、不剧透关键反转；不要列表符号；不要「本书讲述了」等套话开头。`,
    inputPlaceholder: "世界观亮点、主角动机、主要矛盾、读者可期待的爽点或泪点…",
  },
  names: {
    title: "NPC 命名",
    hint: "批量生成人名、地名、势力名；结果请自行复制到正文或锦囊术语表。",
    system: `你是虚构作品命名助手。根据用户给出的题材与风格，生成原创中文名称（必要时可含简短外文专名），不要解释创作思路。
输出必须严格使用以下小节标题（即使某类数量为 0 也保留标题行，数量为 0 时该节留空）：
【人名】
【地名】
【势力名】
每节内一行一个名称，不要编号。`,
    inputPlaceholder: "时代感、地理/文化背景、命名禁忌（避免某字）、整体气质…",
  },
};

type NameScope = "all" | "person" | "place" | "faction";

export function LuobiGeneratorPage() {
  const { mode: modeParam } = useParams<{ mode: string }>();
  const mode = isGeneratorMode(modeParam) ? modeParam : null;

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  useEffect(() => {
    const sync = () => setSettings(loadAiSettings());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const lastWorkId = readLastWorkId();
  const [workTitle, setWorkTitle] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lastWorkId) {
        setWorkTitle(null);
        return;
      }
      const w = await getWork(lastWorkId);
      if (!cancelled) setWorkTitle(w?.title ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [lastWorkId]);

  const meta = mode ? MODE_META[mode] : null;

  const [input, setInput] = useState("");
  const [nameScope, setNameScope] = useState<NameScope>("all");
  const [nameCount, setNameCount] = useState(8);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appliedHint, setAppliedHint] = useState<string | null>(null);

  const providerLine = useMemo(() => {
    const p = settings.provider;
    const cfg = getProviderConfig(settings, p);
    const model = (cfg as { model?: string }).model;
    return model ? `${p} · ${model}` : p;
  }, [settings]);

  const buildUserPrompt = useCallback(() => {
    if (!mode || !meta) return "";
    const ctx: string[] = [];
    if (lastWorkId && workTitle) {
      ctx.push(`【上下文】最近打开的作品标题：${workTitle}`);
    }
    if (mode === "names") {
      const n = Math.min(20, Math.max(3, Math.round(nameCount)));
      const scopeText =
        nameScope === "all"
          ? `请为每一类各生成 ${n} 个名称（人名、地名、势力名各 ${n} 个）。`
          : nameScope === "person"
            ? `仅生成【人名】小节，共 ${n} 个；地名与势力名两节留空。`
            : nameScope === "place"
              ? `仅生成【地名】小节，共 ${n} 个；人名与势力名两节留空。`
              : `仅生成【势力名】小节，共 ${n} 个；人名与地名两节留空。`;
      ctx.push(scopeText);
    }
    const body = input.trim();
    if (body) ctx.push(`【用户说明】\n${body}`);
    return ctx.join("\n\n");
  }, [mode, meta, lastWorkId, workTitle, input, nameScope, nameCount]);

  const run = async () => {
    if (!mode || !meta) return;
    setError(null);
    setAppliedHint(null);
    const userContent = buildUserPrompt();
    if (!userContent.trim()) {
      setError("请先填写说明或选择生成范围。");
      return;
    }
    setLoading(true);
    setOutput("");
    try {
      const p = settings.provider;
      const config = getProviderConfig(settings, p);
      const messages = [
        { role: "system" as const, content: meta.system },
        { role: "user" as const, content: userContent },
      ];
      const r = await generateWithProvider({
        provider: p,
        config,
        messages,
        temperature: mode === "blurb" ? 0.75 : 0.85,
      });
      setOutput((r.text ?? "").trim());
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) {
        setError(null);
        return;
      }
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const copyOut = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("无法写入剪贴板");
    }
  };

  const applyToWork = async () => {
    if (!lastWorkId || !output.trim()) return;
    if (mode !== "book-title" && mode !== "blurb") return;
    setError(null);
    try {
      if (mode === "book-title") {
        const line = output
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0);
        if (!line) {
          setError("没有可写入的书名（请先产生有效输出）。");
          return;
        }
        await updateWork(lastWorkId, { title: line.slice(0, 500) });
        setAppliedHint("已写入当前作品书名。");
      } else {
        await updateWork(lastWorkId, { description: output.trim().slice(0, 8000) });
        setAppliedHint("已写入当前作品简介。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "写入失败");
    }
  };

  if (!mode || !meta) {
    return <Navigate to="/luobi" replace />;
  }

  const canApply = Boolean(lastWorkId && output.trim() && (mode === "book-title" || mode === "blurb"));

  return (
    <div className="page luobi-generator mx-auto max-w-3xl pb-10">
      <div className="mb-6">
        <Link
          to="/luobi"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回创作工具箱
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{meta.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{meta.hint}</p>
        {lastWorkId ? (
          <p className="mt-2 text-xs text-muted-foreground/90">
            当前关联作品：{workTitle ? `《${workTitle}》` : "（加载中或标题为空）"} — 写入操作仅作用于该作品。
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground/90">未记录最近作品；仍可生成与复制。若要写入书名/简介，请先在作品库打开一部作品。</p>
        )}
      </div>

      <div className="space-y-5 rounded-xl border border-border/60 bg-card/30 p-5 shadow-sm">
        {mode === "names" ? (
          <div className="space-y-3">
            <Label className="text-foreground">生成范围</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "全套（人/地/势力）"],
                  ["person", "仅人名"],
                  ["place", "仅地名"],
                  ["faction", "仅势力名"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setNameScope(id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    nameScope === id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/50 text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name-count" className="text-foreground">
                  每类数量
                </Label>
                <input
                  id="name-count"
                  type="number"
                  min={3}
                  max={20}
                  value={nameCount}
                  onChange={(e) => setNameCount(Number(e.target.value))}
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="gen-input" className="text-foreground">
            说明与约束
          </Label>
          <Textarea
            id="gen-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={meta.inputPlaceholder}
            rows={5}
            className="min-h-[120px] resize-y"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void run()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                生成中…
              </>
            ) : (
              "生成"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyOut()} disabled={!output}>
            {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            复制结果
          </Button>
          {mode === "book-title" || mode === "blurb" ? (
            <Button type="button" variant="secondary" onClick={() => void applyToWork()} disabled={!canApply}>
              {mode === "book-title" ? "写入当前作品书名" : "写入当前作品简介"}
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">当前模型：{providerLine}</p>
        {appliedHint ? <p className="text-sm text-primary">{appliedHint}</p> : null}
        {error ? <AiInlineErrorNotice message={error} /> : null}
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="gen-output" className="text-foreground">
          生成结果
        </Label>
        <Textarea
          id="gen-output"
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="点击「生成」后结果出现在此，也可手动编辑后再复制。"
          rows={14}
          className="min-h-[280px] font-mono text-sm leading-relaxed"
        />
      </div>

      <HubAiSettingsHint />
    </div>
  );
}
