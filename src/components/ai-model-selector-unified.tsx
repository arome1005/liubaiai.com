import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import type { AiProviderId, AiSettings } from "../ai/types";
import { getProviderTemperature, loadAiSettings, patchProviderTemperature, saveAiSettings } from "../ai/storage";
import { listModelPersonas } from "../util/model-personas";
import { doubaoModelDisplayLabel } from "../util/doubao-ui";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { AI_MODELS, type AIModel } from "./ai-model-selector";

interface AIModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  title?: string;
  overlayClassName?: string;
  contentClassName?: string;
}

function tempBand(t: number): "沉稳" | "意兴渐起" | "灵感喷发" {
  if (t <= 0.7) return "沉稳";
  if (t <= 1.2) return "意兴渐起";
  return "灵感喷发";
}

function tempSides(t: number): { left: string; right: string; center: string } {
  const band = tempBand(t);
  const center = `${band}（${t.toFixed(1)}）`;
  if (band === "沉稳") return { left: "沉稳", right: "意兴渐起", center };
  if (band === "意兴渐起") return { left: "沉稳", right: "灵感喷发", center };
  return { left: "意兴渐起", right: "灵感喷发", center };
}

function Meter(props: { value: number; max?: number }) {
  const max = props.max ?? 5;
  const v = Math.max(0, Math.min(max, Math.floor(props.value)));
  return (
    <span style={{ display: "inline-flex", gap: 6, verticalAlign: "middle" }} aria-label={`${v}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: i < v ? "rgba(250, 204, 21, 0.95)" : "rgba(148, 163, 184, 0.55)",
          }}
        />
      ))}
    </span>
  );
}

function geminiCostStarsFromShensi(t: number) {
  const x = Math.max(0.1, Math.min(2.0, t));
  if (x < 0.8) return 3;
  if (x < 1.3) return 4;
  return 5;
}

function providerLogoImgSrc(p: AiProviderId): string | null {
  switch (p) {
    case "openai":
      return "/logos/openai.png";
    case "anthropic":
      return "/logos/claude.png";
    case "gemini":
    case "vertex":
      return "/logos/gemini.png";
    case "ollama":
    case "mlx":
      return "/logos/ollama.png";
    case "doubao":
      return "/logos/doubao.png";
    case "zhipu":
      return "/logos/zhipu.png";
    case "kimi":
      return "/logos/kimi.png";
    case "xiaomi":
      return "/logos/xiaomi.png";
    default:
      return null;
  }
}

function providerLogoFallbackText(p: AiProviderId): string {
  switch (p) {
    case "anthropic":
      return "雨";
    case "gemini":
    case "vertex":
      return "云";
    case "doubao":
      return "豆";
    case "zhipu":
      return "谱";
    case "kimi":
      return "月";
    case "xiaomi":
      return "米";
    case "ollama":
    case "mlx":
      return "龙";
    default:
      return "·";
  }
}

function AiProviderLogo(props: { provider: AiProviderId }) {
  const p = props.provider;
  const imgSrc = providerLogoImgSrc(p);
  const text = providerLogoFallbackText(p);
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(imgSrc) && !imgFailed;
  return (
    <span aria-hidden className="provider-logo" data-provider={p} title={p}>
      {showImg ? (
        <img src={imgSrc!} alt="" className="provider-logo-img" onError={() => setImgFailed(true)} />
      ) : (
        <span className="provider-logo-fallback">{text}</span>
      )}
    </span>
  );
}

function getProviderModelId(settings: AiSettings, providerId: AiProviderId): string {
  switch (providerId) {
    case "openai":
      return settings.openai.model;
    case "anthropic":
      return settings.anthropic.model;
    case "gemini":
      return settings.gemini.model;
    case "vertex":
      return settings.vertex.model;
    case "doubao":
      return settings.doubao.model;
    case "zhipu":
      return settings.zhipu.model;
    case "kimi":
      return settings.kimi.model;
    case "xiaomi":
      return settings.xiaomi.model;
    case "ollama":
      return settings.ollama.model;
    case "mlx":
      return settings.mlx.model;
    case "claude-code-local":
      return settings.claudeCodeLocal.model;
  }
}

function patchProviderModel(settings: AiSettings, providerId: AiProviderId, modelId: string): AiSettings {
  switch (providerId) {
    case "openai":
      return { ...settings, openai: { ...settings.openai, model: modelId } };
    case "anthropic":
      return { ...settings, anthropic: { ...settings.anthropic, model: modelId } };
    case "gemini":
      return { ...settings, gemini: { ...settings.gemini, model: modelId } };
    case "vertex":
      return { ...settings, vertex: { ...settings.vertex, model: modelId } };
    case "doubao":
      return { ...settings, doubao: { ...settings.doubao, model: modelId } };
    case "zhipu":
      return { ...settings, zhipu: { ...settings.zhipu, model: modelId } };
    case "kimi":
      return { ...settings, kimi: { ...settings.kimi, model: modelId } };
    case "xiaomi":
      return { ...settings, xiaomi: { ...settings.xiaomi, model: modelId } };
    case "ollama":
      return { ...settings, ollama: { ...settings.ollama, model: modelId } };
    case "mlx":
      return { ...settings, mlx: { ...settings.mlx, model: modelId } };
    case "claude-code-local":
      return { ...settings, claudeCodeLocal: { ...settings.claudeCodeLocal, model: modelId } };
  }
}

function providerIdOf(m: AIModel): AiProviderId | null {
  return (m.providerId ?? null) as AiProviderId | null;
}

export function UnifiedAIModelSelector({
  open,
  onOpenChange,
  selectedModelId,
  onSelectModel,
  title = "选择模型",
  overlayClassName,
  contentClassName,
}: AIModelSelectorProps) {
  const navigate = useNavigate();
  const [previewModelId, setPreviewModelId] = useState(selectedModelId);
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [modelPickerTune, setModelPickerTune] = useState<null | "gear" | "shensi">(null);

  useEffect(() => {
    if (!open) {
      setModelPickerTune(null);
      return;
    }
    setSettings(loadAiSettings());
    setPreviewModelId(selectedModelId);
  }, [open, selectedModelId]);

  const previewModel = useMemo(() => AI_MODELS.find((m) => m.id === previewModelId) ?? AI_MODELS[0], [previewModelId]);
  const providerId = providerIdOf(previewModel);

  const recommendedPersonas = useMemo(() => {
    if (!providerId) return [];
    if (providerId === "ollama" || providerId === "mlx") return [];
    return listModelPersonas(providerId);
  }, [providerId]);

  const activeProviderModelId = useMemo(() => {
    if (!providerId) return null;
    return getProviderModelId(settings, providerId);
  }, [providerId, settings]);

  const confirm = () => {
    onSelectModel(previewModelId);
    onOpenChange(false);
  };

  const cloudProvider = Boolean(providerId && providerId !== "ollama" && providerId !== "mlx");
  const disabled = cloudProvider && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);

  function updateSettings(next: AiSettings) {
    saveAiSettings(next);
    setSettings(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={overlayClassName}
        aria-describedby={undefined}
        className={cn(
          "model-picker-dialog z-[var(--z-modal-app-content)] max-h-[min(92vh,880px)] w-full max-w-[min(880px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[min(880px,calc(100vw-2rem))]",
          contentClassName,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <DialogTitle className="text-left text-lg font-semibold">{title}</DialogTitle>
          <button type="button" className="icon-btn" title="关闭" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </div>

        <div className="model-picker model-picker--dialog">
          <div className="model-picker-body">
            <div className="model-picker-left" role="tablist" aria-label="模型列表">
              {AI_MODELS.map((m) => {
                const active = previewModelId === m.id;
                const pid = (m.providerId ?? "ollama") as AiProviderId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={"model-picker-item" + (active ? " is-active" : "")}
                    onClick={() => setPreviewModelId(m.id)}
                  >
                    <AiProviderLogo provider={pid} />
                    <span className="model-picker-item-main">
                      <span className="model-picker-item-title">{m.name}</span>
                      <span className="model-picker-item-sub muted small">{m.subtitle}</span>
                    </span>
                    <span className="model-picker-item-tag muted small">{selectedModelId === m.id ? "当前" : ""}</span>
                  </button>
                );
              })}
            </div>

            {/* 右侧详情面板 — dock 置于此内，与 AiPanel.tsx 结构一致 */}
            <div className="model-picker-right" role="tabpanel" aria-label="模型介绍">
              <div className="model-picker-right-scroll">
                <div className="model-picker-right-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {providerId ? <AiProviderLogo provider={providerId} /> : null}
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>{previewModel.name}</div>
                      <div className="muted small">{previewModel.subtitle}</div>
                    </div>
                  </div>
                </div>

                <div className="model-picker-quote">{previewModel.quote}</div>
                <div className="model-picker-core">{previewModel.description}</div>

                <div className="model-picker-meters">
                  <div className="model-meter">
                    <div className="muted small">文采水平</div>
                    <Meter value={previewModel.ratings.literary} />
                  </div>
                  <div className="model-meter">
                    <div className="muted small">指令遵从</div>
                    <Meter value={previewModel.ratings.instruction} />
                  </div>
                  <div className="model-meter">
                    <div className="muted small">字数消耗</div>
                    <Meter
                      value={
                        providerId && cloudProvider
                          ? geminiCostStarsFromShensi(getProviderTemperature(settings, providerId))
                          : previewModel.ratings.tokenCost
                      }
                    />
                  </div>
                </div>

                {providerId && recommendedPersonas.length > 0 ? (
                  <div className="model-persona">
                    {providerId === "doubao" ? (
                      <p className="muted small" style={{ margin: "0 0 10px", lineHeight: 1.55 }}>
                        当前展示：<strong>{doubaoModelDisplayLabel(settings.doubao)}</strong>
                        {(settings.doubao.modelDisplayName ?? "").trim() ? (
                          <>
                            <br />
                            <span style={{ opacity: 0.88 }}>
                              实际 endpoint：<code style={{ fontSize: "0.85em" }}>{settings.doubao.model}</code>
                            </span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    <div style={{ fontWeight: 800, margin: "14px 0 8px" }}>推荐模型</div>
                    <div className="model-persona-grid" role="list" aria-label="推荐模型列表">
                      {recommendedPersonas.map((p) => {
                        const on = activeProviderModelId === p.modelId;
                        const stars = p.costStars ?? 3;
                        return (
                          <button
                            key={`${p.provider}:${p.modelId}`}
                            type="button"
                            role="listitem"
                            className={"model-persona-card" + (on ? " is-on" : "")}
                            title={p.modelId}
                            onClick={() => {
                              updateSettings(patchProviderModel(loadAiSettings(), p.provider, p.modelId));
                            }}
                          >
                            <div className="model-persona-card-head">
                              <div className="model-persona-card-title">{p.title}</div>
                              <div className="model-persona-card-badges">
                                {p.tags?.slice(0, 2).map((t) => (
                                  <span key={t} className="model-persona-badge muted small">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="muted small">{p.subtitle}</div>
                            <div className="model-persona-card-desc muted small">{p.description}</div>
                            <div className="model-persona-card-foot muted small">
                              <span className="model-persona-modelid">{p.modelId}</span>
                              <span className="model-persona-cost">{Array.from({ length: stars }).fill("★").join("")}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="model-picker-note">
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>注意事项</div>
                  <div className="muted small" style={{ lineHeight: 1.65 }}>
                    {previewModel.notes}
                  </div>
                </div>
              </div>

              {/* 底部操作栏 — 置于 model-picker-right 内，与 AiPanel.tsx 结构一致，确保不被截断 */}
              <div className="model-picker-tune model-picker-tune--dock">
                <div className="model-picker-tune-dock" role="toolbar" aria-label="模型操作">
                  {providerId && cloudProvider ? (
                    (() => {
                      const personasAll = listModelPersonas(providerId).filter((p) => (p.modelId ?? "").trim());
                      const gearPersonas = personasAll;
                      if (gearPersonas.length < 2) return null;

                      const activeModelId = (getProviderModelId(settings, providerId) ?? "").trim();
                      const idx = Math.max(
                        0,
                        Math.min(
                          gearPersonas.length - 1,
                          Math.max(0, gearPersonas.findIndex((p) => (p.modelId ?? "").trim() === activeModelId)),
                        ),
                      );
                      const pct = gearPersonas.length <= 1 ? 0 : (idx / (gearPersonas.length - 1)) * 100;
                      const invPct = 100 - pct;
                      const tubeBg = `linear-gradient(to top,
                                rgba(0,0,0,0.78) 0%,
                                rgba(0,0,0,0.78) ${pct}%,
                                rgba(0,0,0,0.12) ${pct}%,
                                rgba(0,0,0,0.12) 100%)`;
                      const label = gearPersonas[idx]?.title ?? "档位";

                      return (
                        <div className="model-picker-dock-anchor">
                          {modelPickerTune === "gear" ? (
                            <div className="model-picker-mini-pop model-picker-mini-pop--gear" role="dialog" aria-label="模型档位">
                              <div className="temp-wrap model-picker-gear-thermo">
                                <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                  {label}
                                </div>
                                <div className="temp-vert temp-vert--mini" aria-label="模型档位">
                                  <div className="temp-tube" aria-hidden="true" style={{ background: tubeBg }} />
                                  <input
                                    className="temp-slider temp-slider--vert"
                                    type="range"
                                    min={0}
                                    max={gearPersonas.length - 1}
                                    step={1}
                                    value={idx}
                                    onChange={(e) => {
                                      const i = Math.max(0, Math.min(gearPersonas.length - 1, Number(e.target.value) || 0));
                                      const m = (gearPersonas[i]?.modelId ?? "").trim();
                                      if (!m) return;
                                      updateSettings(patchProviderModel(loadAiSettings(), providerId, m));
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="model-picker-mini-pop-caret" aria-hidden />
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className={"model-picker-dock-btn" + (modelPickerTune === "gear" ? " is-active" : "")}
                            aria-pressed={modelPickerTune === "gear"}
                            aria-expanded={modelPickerTune === "gear"}
                            onClick={() => setModelPickerTune((p) => (p === "gear" ? null : "gear"))}
                          >
                            模型档位
                          </button>
                        </div>
                      );
                    })()
                  ) : null}

                  {providerId && cloudProvider ? (
                    <div className="model-picker-dock-anchor">
                      {modelPickerTune === "shensi" ? (
                        <div className="model-picker-mini-pop model-picker-mini-pop--shensi" role="dialog" aria-label="深思">
                          {(() => {
                            const t = getProviderTemperature(settings, providerId);
                            const pct = Math.max(0, Math.min(100, ((t - 0.1) / 1.9) * 100));
                            const invPct = 100 - pct;
                            return (
                              <div className="model-picker-shensi-pop">
                                <div className="model-picker-shensi-col">
                                  <div className="temp-wrap model-picker-shensi-body temp-pop-thermo">
                                    <div className="temp-float temp-float--mini muted small" style={{ top: `${invPct}%` }}>
                                      {tempSides(t).center}
                                    </div>
                                    <div className="temp-vert temp-vert--mini" aria-label="Temperature">
                                      <div
                                        className="temp-tube temp-tube--fill"
                                        aria-hidden="true"
                                        style={{ ["--fill" as never]: `${pct}%` }}
                                      />
                                      <input
                                        className="temp-slider temp-slider--vert"
                                        type="range"
                                        min={0.1}
                                        max={2.0}
                                        step={0.1}
                                        value={t}
                                        onChange={(e) => {
                                          const v = Math.max(0.1, Math.min(2.0, Number(e.target.value) || 1.2));
                                          updateSettings(patchProviderTemperature(loadAiSettings(), providerId, v));
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="model-picker-mini-pop-caret" aria-hidden />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={"model-picker-dock-btn" + (modelPickerTune === "shensi" ? " is-active" : "")}
                        aria-pressed={modelPickerTune === "shensi"}
                        aria-expanded={modelPickerTune === "shensi"}
                        onClick={() => setModelPickerTune((p) => (p === "shensi" ? null : "shensi"))}
                      >
                        深思
                      </button>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="btn primary model-picker-dock-use"
                    aria-disabled={disabled}
                    title={disabled ? "去设置开启" : ""}
                    onClick={() => {
                      if (disabled) {
                        onOpenChange(false);
                        void navigate("/settings#ai-privacy");
                        return;
                      }
                      confirm();
                    }}
                  >
                    使用
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
