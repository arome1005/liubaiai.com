import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import type { AiProviderId, AiSettings } from "../ai/types";
import { getProviderConfig, patchProviderConfig } from "../ai/storage";
import { shouldUseRouterProtocol } from "../ai/providers";
import { listCatalogPersonas } from "../util/model-personas";
import {
  Cloud, Cpu, Flame, Globe, Lock, Server, Shield, Sliders, Sparkles, Zap,
} from "lucide-react";
import {
  BCard,
  BField,
  BHead,
  EyeToggle,
  HealthTable,
  TestBadge,
} from "./backend-modal/_shared";
import {
  type ModelHealth,
  type GeminiModelHealth,
  loadGeminiModelHealth,
  loadModelHealth,
  saveGeminiModelHealth,
  saveModelHealth,
} from "./backend-modal/health-storage";
import {
  fetchOllamaModelNames,
  testAnthropicModel,
  testGeminiModel,
  testOllamaModel,
  testOpenAICompatibleModel,
} from "./backend-modal/test-helpers";
import { PrivacyPanel } from "./backend-modal/PrivacyPanel";
import { DefaultsPanel } from "./backend-modal/DefaultsPanel";

type ProviderTestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "err"; message: string };

/** 潜龙（Ollama/MLX）合并为单独导航 `qianlong`，页内再切换具体后端 */
type NavId = "privacy" | "defaults" | "qianlong" | Exclude<AiProviderId, "ollama" | "mlx">;

export function BackendModelConfigModal(props: {
  open: boolean;
  settings: AiSettings;
  onChange: (next: AiSettings) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { open, settings, onChange } = props;
  const [nav, setNav] = useState<NavId>("privacy");
  const [localProvider, setLocalProvider] = useState<"ollama" | "mlx">("ollama");

  useEffect(() => {
    if (!open) return;
    const p = settings.provider;
    if (p === "ollama" || p === "mlx") setLocalProvider(p);
  }, [open, settings.provider]);
  const [geminiHealth, setGeminiHealth] = useState<GeminiModelHealth>(() => loadGeminiModelHealth());
  const [geminiHealthDirty, setGeminiHealthDirty] = useState(false);
  const [geminiBatch, setGeminiBatch] = useState<{ running: boolean; idx: number; total: number }>({
    running: false,
    idx: 0,
    total: 0,
  });
  const [modelHealth, setModelHealth] = useState<Record<AiProviderId, ModelHealth>>({
    openai: loadModelHealth("openai"),
    anthropic: loadModelHealth("anthropic"),
    gemini: loadModelHealth("gemini"),
    doubao: loadModelHealth("doubao"),
    zhipu: loadModelHealth("zhipu"),
    kimi: loadModelHealth("kimi"),
    xiaomi: loadModelHealth("xiaomi"),
    ollama: loadModelHealth("ollama"),
    mlx: loadModelHealth("mlx"),
    "claude-code-local": {},
  });
  const [modelHealthDirty, setModelHealthDirty] = useState<Record<AiProviderId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    doubao: false,
    zhipu: false,
    kimi: false,
    xiaomi: false,
    ollama: false,
    mlx: false,
    "claude-code-local": false,
  });
  const [modelBatch, setModelBatch] = useState<Record<AiProviderId, { running: boolean; idx: number; total: number }>>({
    openai: { running: false, idx: 0, total: 0 },
    anthropic: { running: false, idx: 0, total: 0 },
    gemini: { running: false, idx: 0, total: 0 },
    doubao: { running: false, idx: 0, total: 0 },
    zhipu: { running: false, idx: 0, total: 0 },
    kimi: { running: false, idx: 0, total: 0 },
    xiaomi: { running: false, idx: 0, total: 0 },
    ollama: { running: false, idx: 0, total: 0 },
    mlx: { running: false, idx: 0, total: 0 },
    "claude-code-local": { running: false, idx: 0, total: 0 },
  });
  const [showKey, setShowKey] = useState<Record<AiProviderId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    doubao: false,
    zhipu: false,
    kimi: false,
    xiaomi: false,
    ollama: false,
    mlx: false,
    "claude-code-local": false,
  });
  const [testState, setTestState] = useState<Record<AiProviderId, ProviderTestState>>({
    openai: { status: "idle" },
    anthropic: { status: "idle" },
    gemini: { status: "idle" },
    doubao: { status: "idle" },
    zhipu: { status: "idle" },
    kimi: { status: "idle" },
    xiaomi: { status: "idle" },
    ollama: { status: "idle" },
    mlx: { status: "idle" },
    "claude-code-local": { status: "idle" },
  });

  /** 潜龙：/api/tags 拉取到的本机模型名（需 Ollama 已启动） */
  const [ollamaDetected, setOllamaDetected] = useState<string[]>([]);
  const [ollamaFetchStatus, setOllamaFetchStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [ollamaFetchErr, setOllamaFetchErr] = useState<string | null>(null);

  const providers = useMemo(() => {
    return [
      { id: "openai" as const, label: "见山", navSub: "openai", title: "OpenAI（见山）" },
      { id: "anthropic" as const, label: "听雨", navSub: "anthropic", title: "Claude（听雨）" },
      { id: "gemini" as const, label: "观云", navSub: "gemini", title: "Gemini（观云）" },
      { id: "doubao" as const, label: "燎原", navSub: "doubao", title: "豆包（燎原）" },
      { id: "zhipu" as const, label: "智谱", navSub: "zhipu", title: "智谱 GLM" },
      { id: "kimi" as const, label: "Kimi", navSub: "kimi", title: "Kimi（Moonshot）" },
      { id: "xiaomi" as const, label: "小米", navSub: "xiaomi", title: "小米 MiMo" },
    ] satisfies Array<{ id: Exclude<AiProviderId, "ollama" | "mlx">; label: string; navSub: string; title: string }>;
  }, []);

  /** 顺序与 `model-personas` 中观云档位一致：初见（轻）→ 入微 → 化境（强） */
  const geminiPresetModels = useMemo(
    () => ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"],
    [],
  );

  /** 见山：常用 OpenAI 模型 ID（涵盖原生直连 5.4 系列与 OpenRouter 中转） */
  const openaiPresetModels = useMemo(() => [
    "gpt-5.4-mini", "gpt-5.4-standard", "gpt-5.4-pro", "gpt-5.4-thinking",
    "openai/gpt-5.4-mini", "openai/gpt-5.4-pro", "openai/gpt-5.4-thinking"
  ], []);

  /** 听雨：常用 Claude 模型 ID（涵盖原生直连 4.7 系列与 OpenRouter 中转） */
  const anthropicPresetModels = useMemo(
    () => [
      "claude-4.7-haiku", "claude-4.7-sonnet", "claude-4.7-opus",
      "anthropic/claude-4.7-sonnet", "anthropic/claude-4.7-opus"
    ],
    [],
  );

  /** 燎原：豆包 Ark 常用（以控制台为准） */
  // 提供给 UI 下拉框的一个示例占位符，但在批量测试时（下方的 presetModelIdsForProvider）会跳过它
  const doubaoPresetModels = useMemo(() => ["ep-20260315234645-2h6jf"], []);

  /** Kimi：Moonshot 常用 */
  const kimiPresetModels = useMemo(
    () => ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2.5-turbo-preview"],
    [],
  );

  /** 小米 MiMo 写作常用（文档另有 omni/tts 等可手动填写） */
  const xiaomiWritingModels = useMemo(() => ["mimo-v2-pro", "mimo-v2-flash"] as const, []);

  /** 智谱文本模型（ID 以 docs.bigmodel.cn 对话补全示例为准） */
  const zhipuPresetModels = useMemo(
    () =>
      [
        { id: "glm-5", label: "glm-5（最新旗舰）" },
        { id: "glm-4.7", label: "glm-4.7（高智能）" },
        { id: "glm-4.7-flashx", label: "glm-4.7-flashx（轻量高速·写作）" },
        { id: "glm-4.7-flash", label: "glm-4.7-flash（免费普惠）" },
      ] as const,
    [],
  );

  /** 一键测试 / 底部健康表：各云端预置模型 ID（Ollama 走本地检测） */
  function presetModelIdsForProvider(pid: AiProviderId): string[] | null {
    switch (pid) {
      case "openai":
        return [...openaiPresetModels];
      case "anthropic":
        return [...anthropicPresetModels];
      case "doubao":
        return null;
      case "zhipu":
        return zhipuPresetModels.map((x) => x.id);
      case "kimi":
        return [...kimiPresetModels];
      case "xiaomi":
        return [...xiaomiWritingModels];
      case "gemini":
        return [...geminiPresetModels];
      case "mlx":
        return null;
      default:
        return null;
    }
  }

  /** 导航图标配置 */
  const navIconMap: Record<string, { icon: React.ElementType; bg: string }> = {
    privacy:    { icon: Shield,   bg: "bg-rose-500" },
    defaults:   { icon: Sliders,  bg: "bg-indigo-500" },
    openai:     { icon: Sparkles, bg: "bg-green-500" },
    anthropic:  { icon: Zap,      bg: "bg-amber-500" },
    gemini:     { icon: Cloud,    bg: "bg-blue-500" },
    doubao:     { icon: Flame,    bg: "bg-orange-500" },
    zhipu:      { icon: Globe,    bg: "bg-cyan-500" },
    kimi:       { icon: Globe,    bg: "bg-sky-500" },
    xiaomi:     { icon: Cpu,      bg: "bg-slate-500" },
    qianlong:   { icon: Server,   bg: "bg-violet-500" },
  };

  function doSave() {
    if (geminiHealthDirty) { saveGeminiModelHealth(geminiHealth); setGeminiHealthDirty(false); }
    for (const p of ["openai","anthropic","gemini","doubao","zhipu","kimi","xiaomi","ollama","mlx"] as AiProviderId[]) {
      if (modelHealthDirty[p]) saveModelHealth(p, modelHealth[p]);
    }
    setModelHealthDirty({ openai:false,anthropic:false,gemini:false,doubao:false,zhipu:false,kimi:false,xiaomi:false,ollama:false,mlx:false,"claude-code-local":false });
    props.onSave();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="work-form-modal-overlay"
        aria-describedby={undefined}
        className={cn(
          "backend-modal-dialog z-[var(--z-modal-app-content)] flex h-[min(92vh,920px)] max-h-[min(92vh,920px)] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-border/50 bg-background p-0 shadow-2xl sm:max-w-[min(1200px,calc(100vw-2rem))]",
        )}
      >
        {/* ── 顶栏 ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-card/30 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-white">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">高级后端配置</DialogTitle>
              <p className="text-[11px] text-muted-foreground">保存于本机 localStorage · 纯前端直连可能遇到 CORS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={doSave}>保存</Button>
            <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>关闭</Button>
          </div>
        </div>

        {/* ── 主体：左导航 + 右内容 ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 左侧导航 */}
          <aside className="w-48 shrink-0 overflow-y-auto border-r border-border/30 bg-card/20 px-2 py-3" aria-label="高级后端配置导航">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">通用</p>
            {[
              { id: "privacy" as const,  label: "隐私与上传",  sub: "云端调用范围" },
              { id: "defaults" as const, label: "默认与上下文", sub: "默认提供方 / 上限" },
            ].map((n) => {
              const im = navIconMap[n.id];
              const Icon = im?.icon ?? Globe;
              const active = nav === n.id;
              return (
                <button key={n.id} type="button" onClick={() => setNav(n.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors mb-0.5",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", active ? im?.bg : "bg-muted/60")}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">{n.label}</p>
                    <p className="text-[10px] leading-tight opacity-60">{n.sub}</p>
                  </div>
                </button>
              );
            })}

            <div className="my-2 border-t border-border/30" />
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">提供方</p>

            {providers.map((p) => {
              const im = navIconMap[p.id];
              const Icon = im?.icon ?? Cloud;
              const active = nav === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setNav(p.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors mb-0.5",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", active ? im?.bg : "bg-muted/60")}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">{p.label}</p>
                    <p className="text-[10px] leading-tight opacity-60">{p.navSub}</p>
                  </div>
                </button>
              );
            })}
            {(() => {
              const im = navIconMap["qianlong"];
              const Icon = im?.icon ?? Server;
              const active = nav === "qianlong";
              return (
                <button type="button" onClick={() => setNav("qianlong")}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors mb-0.5",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", active ? im?.bg : "bg-muted/60")}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight">潜龙</p>
                    <p className="text-[10px] leading-tight opacity-60">本地 · Ollama / MLX</p>
                  </div>
                </button>
              );
            })()}
          </aside>

          {/* 右侧内容 */}
          <main className="min-h-0 flex-1 overflow-y-auto p-5" aria-label="高级后端配置内容">
            {nav === "privacy" ? (
              <PrivacyPanel settings={settings} onChange={onChange} />
            ) : null}

            {nav === "defaults" ? (
              <DefaultsPanel settings={settings} onChange={onChange} />
            ) : null}

            {nav === "qianlong" || providers.some((p) => p.id === nav) ? (
              (() => {
                const id: AiProviderId = nav === "qianlong" ? localProvider : (nav as AiProviderId);
                const cfg = getProviderConfig(settings, id);
                const s = testState[id];
                const keyShown = showKey[id];
                const isGemini = id === "gemini";
                const batch = modelBatch[id];
                const list =
                  id === "ollama"
                    ? ollamaDetected.length > 0
                      ? ollamaDetected
                      : [cfg.model].filter(Boolean)
                    : id === "mlx"
                      ? [cfg.model].filter(Boolean)
                      : id === "anthropic" && shouldUseRouterProtocol(cfg)
                        ? (cfg.model ?? "").trim()
                          ? [(cfg.model ?? "").trim()]
                          : []
                        : presetModelIdsForProvider(id) ?? [cfg.model].filter(Boolean);
                return (
                  <div className="space-y-4">
                    <BCard>
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          {nav === "qianlong" ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground">
                                  {localProvider === "ollama" ? "Ollama（潜龙）" : "MLX（潜龙）"}
                                </h3>
                                <div role="group" className="flex gap-1">
                                  <Button type="button" size="sm" variant={localProvider === "ollama" ? "default" : "outline"} onClick={() => setLocalProvider("ollama")}>Ollama</Button>
                                  <Button type="button" size="sm" variant={localProvider === "mlx" ? "default" : "outline"} onClick={() => setLocalProvider("mlx")}>MLX</Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">本机模型（默认不需要 API Key）</p>
                            </div>
                          ) : (
                            <div>
                              <h3 className="text-sm font-semibold text-foreground">{providers.find((p) => p.id === id)?.title ?? id}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {id === "ollama" || id === "mlx" ? "本机模型（默认不需要 API Key）" : "云端模型（需 API Key；可能遇到 CORS）"}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                          type="button" size="sm" variant="outline"
                          disabled={s.status === "testing" || (isGemini && geminiBatch.running) || (!isGemini && batch.running)}
                          onClick={() => {
                            if (!isGemini) {
                              const models = list;
                              if (models.length === 0) {
                                setTestState((prev) => ({
                                  ...prev,
                                  [id]: {
                                    status: "err",
                                    message:
                                      id === "anthropic" && shouldUseRouterProtocol(cfg)
                                        ? "中转模式请先在 Model 填写网关兼容的模型 ID，再一键测试"
                                        : "没有可测试的模型",
                                  },
                                }));
                                return;
                              }
                              setModelBatch((m) => ({ ...m, [id]: { running: true, idx: 0, total: models.length } }));
                              setTestState((prev) => ({ ...prev, [id]: { status: "testing" } }));
                              void (async () => {
                                const baseCfg = getProviderConfig(settings, id);
                                for (let i = 0; i < models.length; i++) {
                                  const model = models[i]!;
                                  setModelBatch((m) => ({ ...m, [id]: { running: true, idx: i + 1, total: models.length } }));
                                  try {
                                    if (
                                      id === "openai" ||
                                      id === "doubao" ||
                                      id === "zhipu" ||
                                      id === "kimi" ||
                                      id === "xiaomi" ||
                                      id === "mlx"
                                    ) {
                                      await testOpenAICompatibleModel({ cfg: baseCfg, model });
                                    } else if (id === "anthropic") {
                                      if (shouldUseRouterProtocol(baseCfg)) {
                                        await testOpenAICompatibleModel({ cfg: baseCfg, model });
                                      } else {
                                        await testAnthropicModel({ cfg: baseCfg, model });
                                      }
                                    } else {
                                      await testOllamaModel({ cfg: baseCfg, model });
                                    }
                                    setModelHealth((h) => ({
                                      ...h,
                                      [id]: { ...h[id], [model]: { verdict: "ok", testedAt: Date.now() } },
                                    }));
                                  } catch {
                                    setModelHealth((h) => ({
                                      ...h,
                                      [id]: { ...h[id], [model]: { verdict: "err", testedAt: Date.now() } },
                                    }));
                                  } finally {
                                    setModelHealthDirty((d) => ({ ...d, [id]: true }));
                                  }
                                }
                                setModelBatch((m) => ({ ...m, [id]: { running: false, idx: 0, total: 0 } }));
                                setTestState((prev) => ({ ...prev, [id]: { status: "ok", message: "批量测试完成" } }));
                              })();
                              return;
                            }

                            // Gemini：原生走预置版本；中转仅测当前 Model（网关 model id 与原生 id 不同）
                            void (() => {
                              const baseCfg = getProviderConfig(settings, "gemini");
                              const geminiBatchModels = shouldUseRouterProtocol(baseCfg)
                                ? (baseCfg.model ?? "").trim()
                                  ? [(baseCfg.model ?? "").trim()]
                                  : []
                                : [...geminiPresetModels];
                              if (geminiBatchModels.length === 0) {
                                setTestState((prev) => ({
                                  ...prev,
                                  gemini: {
                                    status: "err",
                                    message: "中转模式请先在 Model 填写网关兼容的模型 ID（如 google/gemini-2.0-flash-001），再一键测试",
                                  },
                                }));
                                return;
                              }
                              setGeminiBatch({ running: true, idx: 0, total: geminiBatchModels.length });
                              setTestState((prev) => ({ ...prev, gemini: { status: "testing" } }));
                              void (async () => {
                                for (let i = 0; i < geminiBatchModels.length; i++) {
                                  const m = geminiBatchModels[i]!;
                                  setGeminiBatch({
                                    running: true,
                                    idx: i + 1,
                                    total: geminiBatchModels.length,
                                  });
                                  try {
                                    if (shouldUseRouterProtocol(baseCfg)) {
                                      await testOpenAICompatibleModel({ cfg: baseCfg, model: m });
                                    } else {
                                      await testGeminiModel({ cfg: baseCfg, modelOverride: m });
                                    }
                                    setGeminiHealth((h) => ({ ...h, [m]: { verdict: "ok", testedAt: Date.now() } }));
                                  } catch {
                                    setGeminiHealth((h) => ({ ...h, [m]: { verdict: "err", testedAt: Date.now() } }));
                                  } finally {
                                    setGeminiHealthDirty(true);
                                  }
                                }
                                setGeminiBatch({ running: false, idx: 0, total: 0 });
                                setTestState((prev) => ({
                                  ...prev,
                                  gemini: { status: "ok", message: "批量测试完成" },
                                }));
                              })();
                            })();
                          }}
                        >
                          一键测试全部版本
                          </Button>
                          {isGemini && geminiBatch.running ? <span className="text-xs text-muted-foreground">测试中… {geminiBatch.idx}/{geminiBatch.total}</span> : null}
                          {!isGemini && batch.running ? <span className="text-xs text-muted-foreground">测试中… {batch.idx}/{batch.total}</span> : null}
                          {s.status === "ok" && !isGemini ? <TestBadge status="ok" message="连接成功" /> : null}
                          {s.status === "err" ? <TestBadge status="err" message={s.message} /> : null}
                          {s.status === "testing" && !isGemini ? <TestBadge status="testing" /> : null}
                        </div>
                      </div>

                    <div className="space-y-4">
                      <BField label="Base URL">
                        <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={cfg.baseUrl ?? ""}
                          onChange={(e) => onChange(patchProviderConfig(settings, id, { baseUrl: e.target.value }))}
                          placeholder={
                            id === "openai" ? "https://api.openai.com/v1"
                            : id === "anthropic" ? "https://api.anthropic.com"
                            : id === "gemini" ? "https://generativelanguage.googleapis.com"
                            : id === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3"
                            : id === "zhipu" ? "https://open.bigmodel.cn/api/paas/v4"
                            : id === "kimi" ? "https://api.moonshot.cn/v1"
                            : id === "xiaomi" ? "https://api.mimo-v2.com/v1"
                            : id === "mlx" ? "http://127.0.0.1:8080/v1"
                            : "http://localhost:11434"
                          }
                        />
                      </BField>

                      {id === "gemini" || id === "anthropic" ? (
                        <BField label="接入方式"
                          hint={id === "gemini"
                            ? "原生：走 Google generateContent。中转：走网关 /v1/chat/completions（如 OpenRouter），模型名常为 google/… 形式。"
                            : "原生：走 Anthropic /v1/messages。中转：走网关 /v1/chat/completions，模型名常为 anthropic/… 前缀。"}>
                          <div className="flex flex-wrap gap-1.5">
                            <Button type="button" size="sm" variant={!shouldUseRouterProtocol(cfg) ? "default" : "outline"}
                              onClick={() => onChange(patchProviderConfig(settings, id, { transport: "native", baseUrl: id === "anthropic" ? "https://api.anthropic.com" : "https://generativelanguage.googleapis.com" }))}>
                              原生（官方 API）
                            </Button>
                            <Button type="button" size="sm" variant={shouldUseRouterProtocol(cfg) ? "default" : "outline"}
                              onClick={() => onChange(patchProviderConfig(settings, id, { transport: "router", baseUrl: "https://openrouter.ai/api/v1" }))}>
                              中转（OpenAI 兼容）
                            </Button>
                            <Button type="button" size="sm" variant="ghost"
                              onClick={() => onChange(patchProviderConfig(settings, id, { transport: undefined }))}
                              title="清除显式选择后，按 Base URL 自动判断">
                              按 Base URL 自动
                            </Button>
                          </div>
                        </BField>
                      ) : null}

                      {id === "gemini" || id === "anthropic" ? (
                        <BField label="原生 API Base（可选）"
                          hint="直连官方协议时优先用此地址；未填时，若上方 Base URL 不是网关域名则退回上方；否则用官方默认。">
                          <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                            value={cfg.baseUrlNative ?? ""}
                            onChange={(e) => onChange(patchProviderConfig(settings, id, { baseUrlNative: e.target.value.trim() || undefined }))}
                            placeholder={id === "gemini" ? "例如：https://generativelanguage.googleapis.com" : "例如：https://api.anthropic.com"} />
                        </BField>
                      ) : null}

                      <BField label="API Key">
                        <div className="flex items-center gap-1.5">
                          <input className="min-w-0 flex-1 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40"
                            type={keyShown ? "text" : "password"}
                            value={cfg.apiKey ?? ""}
                            onChange={(e) => onChange(patchProviderConfig(settings, id, { apiKey: e.target.value }))}
                            placeholder={id === "ollama" ? "（Ollama 通常不需要）" : id === "mlx" ? "（可选）" : ""}
                            disabled={id === "ollama"} />
                          {id !== "ollama" ? <EyeToggle shown={keyShown} onToggle={() => setShowKey((m) => ({ ...m, [id]: !m[id] }))} /> : null}
                        </div>
                      </BField>

                      <BField label="Model">
                        {id === "gemini" ? (
                          <div className="space-y-3">
                            <select className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}>
                              {geminiPresetModels.map((m) => <option key={m} value={m}>{m}</option>)}
                              {cfg.model && !geminiPresetModels.includes(cfg.model) ? <option value={cfg.model}>{cfg.model}（当前）</option> : null}
                            </select>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={geminiBatch.running}
                                onClick={() => { setTestState((prev) => ({ ...prev, gemini: { status: "testing" } })); void (async () => { try { const gCfg = getProviderConfig(settings, "gemini"); let msg: string; if (shouldUseRouterProtocol(gCfg)) { await testOpenAICompatibleModel({ cfg: gCfg, model: gCfg.model.trim() || geminiPresetModels[0]! }); msg = "连接成功（OpenAI 兼容路径）"; } else { msg = await testGeminiModel({ cfg: gCfg }); } setTestState((prev) => ({ ...prev, gemini: { status: "ok", message: msg } })); setGeminiHealth((h) => ({ ...h, [getProviderConfig(settings, "gemini").model]: { verdict: "ok", testedAt: Date.now() } })); setGeminiHealthDirty(true); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, gemini: { status: "err", message: msg } })); setGeminiHealth((h) => ({ ...h, [getProviderConfig(settings, "gemini").model]: { verdict: "err", testedAt: Date.now() } })); setGeminiHealthDirty(true); } })(); }}>
                                测试该模型版本
                              </Button>
                              <TestBadge status={testState.gemini.status} message={"message" in testState.gemini ? testState.gemini.message : undefined} />
                            </div>
                            <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="例如：gemini-3.1-pro-preview" />
                          </div>
                        ) : id === "xiaomi" ? (
                          <div className="space-y-3">
                            <select className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}>
                              {xiaomiWritingModels.map((m) => <option key={m} value={m}>{m === "mimo-v2-pro" ? "mimo-v2-pro（写作·偏强）" : "mimo-v2-flash（写作·偏快）"}</option>)}
                              {cfg.model !== "mimo-v2-pro" && cfg.model !== "mimo-v2-flash" && cfg.model ? <option value={cfg.model}>{cfg.model}（当前）</option> : null}
                            </select>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={testState.xiaomi.status === "testing"}
                                onClick={() => { setTestState((prev) => ({ ...prev, xiaomi: { status: "testing" } })); void (async () => { const model = cfg.model.trim() || "mimo-v2-flash"; try { await testOpenAICompatibleModel({ cfg: getProviderConfig(settings, "xiaomi"), model }); setTestState((prev) => ({ ...prev, xiaomi: { status: "ok", message: "连接成功" } })); setModelHealth((h) => ({ ...h, xiaomi: { ...h.xiaomi, [model]: { verdict: "ok", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, xiaomi: true })); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, xiaomi: { status: "err", message: msg } })); setModelHealth((h) => ({ ...h, xiaomi: { ...h.xiaomi, [model]: { verdict: "err", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, xiaomi: true })); } })(); }}>
                                测试该模型版本
                              </Button>
                              <TestBadge status={testState.xiaomi.status} message={"message" in testState.xiaomi ? testState.xiaomi.message : undefined} />
                            </div>
                            <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="模型 ID，如 mimo-v2-pro / mimo-v2-flash" />
                            <p className="text-[11px] text-muted-foreground/70">写作常用上述二者；其它如 mimo-v2-omni 请手动填写。</p>
                          </div>
                        ) : id === "zhipu" ? (
                          <div className="space-y-3">
                            <select className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}>
                              {zhipuPresetModels.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                              {cfg.model && !zhipuPresetModels.some((x) => x.id === cfg.model) ? <option value={cfg.model}>{cfg.model}（当前）</option> : null}
                            </select>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={testState.zhipu.status === "testing"}
                                onClick={() => { setTestState((prev) => ({ ...prev, zhipu: { status: "testing" } })); void (async () => { const model = cfg.model.trim() || "glm-4.7-flash"; try { await testOpenAICompatibleModel({ cfg: getProviderConfig(settings, "zhipu"), model }); setTestState((prev) => ({ ...prev, zhipu: { status: "ok", message: "连接成功" } })); setModelHealth((h) => ({ ...h, zhipu: { ...h.zhipu, [model]: { verdict: "ok", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, zhipu: true })); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, zhipu: { status: "err", message: msg } })); setModelHealth((h) => ({ ...h, zhipu: { ...h.zhipu, [model]: { verdict: "err", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, zhipu: true })); } })(); }}>
                                测试该模型版本
                              </Button>
                              <TestBadge status={testState.zhipu.status} message={"message" in testState.zhipu ? testState.zhipu.message : undefined} />
                            </div>
                            <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="例如：glm-5 / glm-4.7 / glm-4.7-flash" />
                            <p className="text-[11px] text-muted-foreground/70">写作常用 glm-4.7 / glm-4.7-flash；更强推理可试 glm-5。</p>
                          </div>
                        ) : id === "mlx" ? (
                          <div className="space-y-3">
                            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                              Apple MLX 通过 HTTP 连接（OpenAI 兼容 /v1/chat/completions）。默认 Base 为 http://127.0.0.1:8080/v1，请按本机端口修改。需启动带 OpenAI 兼容接口的本地服务后再填写模型 id。
                            </p>
                            <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                              value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="例如：default 或服务返回的模型 id" />
                            <div className="flex items-center gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={testState.mlx.status === "testing"}
                                onClick={() => { setTestState((prev) => ({ ...prev, mlx: { status: "testing" } })); void (async () => { const model = cfg.model.trim() || "default"; try { await testOpenAICompatibleModel({ cfg: getProviderConfig(settings, "mlx"), model }); setTestState((prev) => ({ ...prev, mlx: { status: "ok", message: "连接成功" } })); setModelHealth((h) => ({ ...h, mlx: { ...h.mlx, [model]: { verdict: "ok", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, mlx: true })); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, mlx: { status: "err", message: msg } })); setModelHealth((h) => ({ ...h, mlx: { ...h.mlx, [model]: { verdict: "err", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, mlx: true })); } })(); }}>
                                测试当前模型
                              </Button>
                              <TestBadge status={testState.mlx.status} message={"message" in testState.mlx ? testState.mlx.message : undefined} />
                            </div>
                          </div>
                        ) : id === "ollama" ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">手动填写</p>
                              <p className="text-[11px] text-muted-foreground/70">需与终端 ollama list 中名称一致。</p>
                              <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="例如：llama3.1:8b" />
                              <div className="flex items-center gap-2">
                                <Button type="button" size="sm" variant="outline" disabled={testState.ollama.status === "testing"}
                                  onClick={() => { setTestState((prev) => ({ ...prev, ollama: { status: "testing" } })); void (async () => { try { await testOllamaModel({ cfg: getProviderConfig(settings, "ollama"), model: cfg.model.trim() || "llama3.1:8b" }); setTestState((prev) => ({ ...prev, ollama: { status: "ok", message: "连接成功" } })); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, ollama: { status: "err", message: msg } })); } })(); }}>
                                  测试当前模型
                                </Button>
                                <TestBadge status={testState.ollama.status} message={"message" in testState.ollama ? testState.ollama.message : undefined} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">自动检测</p>
                              <p className="text-[11px] text-muted-foreground/70">需本机已启动 Ollama，拉取 /api/tags 列出已下载模型。若浏览器报 CORS，请用同源代理。</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" size="sm" variant="outline" disabled={ollamaFetchStatus === "loading"}
                                  onClick={() => { setOllamaFetchErr(null); setOllamaFetchStatus("loading"); void (async () => { try { const names = await fetchOllamaModelNames(cfg.baseUrl ?? ""); setOllamaDetected(names); setOllamaFetchStatus("ok"); } catch (e) { const msg = e instanceof Error ? e.message : "检测失败"; setOllamaFetchErr(msg); setOllamaDetected([]); setOllamaFetchStatus("err"); } })(); }}>
                                  {ollamaFetchStatus === "loading" ? "检测中…" : "检测本地模型"}
                                </Button>
                                {ollamaFetchStatus === "ok" && ollamaDetected.length === 0 ? <span className="text-xs text-muted-foreground">未返回模型（可先 ollama pull 再试）</span> : null}
                                {ollamaFetchErr ? <span className="text-xs text-destructive">{ollamaFetchErr}</span> : null}
                              </div>
                              {ollamaDetected.length > 0 ? (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] text-muted-foreground/70">已检测到本地模型（点击填入）</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ollamaDetected.map((name) => (
                                      <Button key={name} type="button" size="sm" variant={cfg.model === name ? "default" : "outline"}
                                        onClick={() => onChange(patchProviderConfig(settings, "ollama", { model: name }))}>
                                        {name}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : id === "openai" || id === "anthropic" || id === "doubao" || id === "kimi" ? (
                          (() => {
                            const cloudPresets = id === "openai" ? openaiPresetModels : id === "anthropic" ? anthropicPresetModels : id === "doubao" ? doubaoPresetModels : kimiPresetModels;
                            const inPreset = cloudPresets.includes(cfg.model);
                            return (
                              <div className="space-y-3">
                                {id === "doubao" ? (
                                  <BField label="界面显示名（可选）" hint="仅 UI 展示；请求仍用下方 Model（如 ep-…）">
                                    <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                      value={cfg.modelDisplayName ?? ""}
                                      onChange={(e) => { const v = e.target.value.trim(); onChange(patchProviderConfig(settings, id, { modelDisplayName: v || undefined })); }}
                                      placeholder="仅 UI 展示" />
                                  </BField>
                                ) : null}
                                <select className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}>
                                  {cloudPresets.map((m) => <option key={m} value={m}>{m}</option>)}
                                  {cfg.model && !inPreset ? <option value={cfg.model}>{cfg.model}（当前）</option> : null}
                                </select>
                                <div className="flex items-center gap-2">
                                  <Button type="button" size="sm" variant="outline" disabled={testState[id].status === "testing"}
                                    onClick={() => { setTestState((prev) => ({ ...prev, [id]: { status: "testing" } })); void (async () => { const model = cfg.model.trim() || cloudPresets[0]!; try { const cloudCfg = getProviderConfig(settings, id); if (id === "anthropic") { if (shouldUseRouterProtocol(cloudCfg)) { await testOpenAICompatibleModel({ cfg: cloudCfg, model }); } else { await testAnthropicModel({ cfg: cloudCfg, model }); } } else { await testOpenAICompatibleModel({ cfg: cloudCfg, model }); } setTestState((prev) => ({ ...prev, [id]: { status: "ok", message: "连接成功" } })); setModelHealth((h) => ({ ...h, [id]: { ...h[id], [model]: { verdict: "ok", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, [id]: true })); } catch (e) { const msg = e instanceof Error ? e.message : "连接失败"; setTestState((prev) => ({ ...prev, [id]: { status: "err", message: msg } })); setModelHealth((h) => ({ ...h, [id]: { ...h[id], [model]: { verdict: "err", testedAt: Date.now() } } })); setModelHealthDirty((d) => ({ ...d, [id]: true })); } })(); }}>
                                    测试该模型版本
                                  </Button>
                                  <TestBadge status={testState[id].status} message={"message" in testState[id] ? testState[id].message : undefined} />
                                </div>
                                <input className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                  value={cfg.model} onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))} placeholder="可手动粘贴其它模型 ID" />
                              </div>
                            );
                          })()
                        ) : null}
                      </BField>
                    </div>
                    </BCard>

                    {/* 推荐模型卡片（Gemini / 云端） */}
                    {(id === "gemini" || id === "openai" || id === "anthropic" || id === "doubao" || id === "kimi") && (() => {
                      const presets = id === "gemini" ? geminiPresetModels : id === "openai" ? openaiPresetModels : id === "anthropic" ? anthropicPresetModels : id === "doubao" ? doubaoPresetModels : kimiPresetModels;
                      const personas = listCatalogPersonas(id, presets);
                      if (!personas.length) return null;
                      return (
                        <BCard>
                          <BHead title="推荐模型" sub="点击卡片快捷填入模型 ID" />
                          <div className="model-persona-grid">
                            {personas.map((p) => (
                              <button key={p.modelId} type="button"
                                className={"model-persona-card" + (cfg.model === p.modelId ? " is-on" : "")}
                                onClick={() => onChange(patchProviderConfig(settings, id, { model: p.modelId }))} title={p.modelId}>
                                <div className="model-persona-card-head">
                                  <div className="model-persona-card-title">{p.title}</div>
                                  <div className="model-persona-card-badges">
                                    {p.tags?.slice(0, 2).map((t) => <span key={t} className="model-persona-badge muted small">{t}</span>)}
                                  </div>
                                </div>
                                <div className="muted small">{p.subtitle}</div>
                                <div className="model-persona-card-desc muted small">{p.description}</div>
                                <div className="model-persona-card-foot muted small">
                                  <span className="model-persona-modelid">{p.modelId}</span>
                                  <span className="model-persona-cost">{Array.from({ length: p.costStars ?? 3 }).fill("★").join("")}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </BCard>
                      );
                    })()}

                    {/* 健康表 */}
                    {id === "gemini" ? (
                      <HealthTable models={geminiPresetModels} health={geminiHealth} dirty={geminiHealthDirty} />
                    ) : list.length > 0 ? (
                      <HealthTable models={list} health={modelHealth[id] ?? {}} dirty={modelHealthDirty[id]} />
                    ) : null}
                  </div>
                );
              })()
            ) : null}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

