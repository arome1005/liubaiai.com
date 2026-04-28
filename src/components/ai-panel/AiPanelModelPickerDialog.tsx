import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isLocalAiProvider } from "../../ai/local-provider";
import {
  getProviderConfig,
  getProviderTemperature,
  patchProviderTemperature,
} from "../../ai/storage";
import type { AiProviderId, AiSettings } from "../../ai/types";
import { doubaoModelDisplayLabel } from "../../util/doubao-ui";
import { listModelPersonas } from "../../util/model-personas";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { AiProviderLogo } from "./AiProviderLogo";
import { PROVIDER_UI } from "./provider-ui";

/** 评分条（5 格星点） */
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

/** 云端「神思」温度 → 字数消耗星级（与各云端弹窗底部滑条联动） */
function geminiCostStarsFromShensi(t: number) {
  const x = Math.max(0.1, Math.min(2.0, t));
  if (x < 0.8) return 3;
  if (x < 1.3) return 4;
  return 5;
}

export interface AiPanelModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AiSettings;
  /** 写入设置（同 `AiPanel` 的 updateSettings）：含 saveAiSettings 持久化 */
  updateSettings: (patch: Partial<AiSettings>) => void;
  /** 切换当前 provider（确认「使用」时调用） */
  updateProvider: (p: AiProviderId) => void;
}

/**
 * 「选择模型」弹窗：左侧 provider 列表 / 右侧介绍卡 + 推荐模型 +「模型档位」「深思」调参 dock。
 *
 * 状态范围：
 * - `pickerActive` / `modelPickerTune` 仅本组件内使用，故下沉到本文件管理；
 * - `open / onOpenChange` 由父级（`AiPanel`）持有，因为「侧栏顶部按钮」与 `run()` 的「未授权云端 → 弹窗」
 *   两条入口都在父组件中触发开启。
 *
 * 本组件不处理 owner-only `claude-code-local`（左侧列表显式不包含），与原内联实现一致。
 */
export function AiPanelModelPickerDialog(props: AiPanelModelPickerDialogProps) {
  const { open, onOpenChange, settings, updateSettings, updateProvider } = props;
  const navigate = useNavigate();

  const [pickerActive, setPickerActive] = useState<AiProviderId>("ollama");
  /** 弹窗底部：观云有「模型档位」+「神思」；其它云端仅有「神思」；Ollama 无温度条 */
  const [modelPickerTune, setModelPickerTune] = useState<null | "gear" | "shensi">(null);

  /**
   * 关闭弹窗：合并写下家 onOpenChange + 本地 modelPickerTune 复位。
   * 取代了原 `useEffect(..., [open])` 的「关闭时清 tune」逻辑，避免 effect 内 setState 触发的级联渲染。
   * 涵盖三类关闭路径：X 按钮 / 「使用」按钮 / Radix 自动关闭（Esc / 点遮罩）。
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) setModelPickerTune(null);
    },
    [onOpenChange],
  );

  /**
   * 切换左侧 provider tab：
   * - 切到本地 provider → 直接清掉 tune（本地无温度/档位条）。
   * - 切到云端 provider 且当前 tune 是「模型档位」，但目标 provider 没有 ≥2 档位 → 也清掉。
   * 取代了原 `useEffect(..., [pickerActive, modelPickerTune])` 的同步校验。
   */
  const selectPickerActive = useCallback((id: AiProviderId) => {
    setPickerActive(id);
    if (isLocalAiProvider(id)) {
      setModelPickerTune(null);
      return;
    }
    setModelPickerTune((cur) => {
      if (cur !== "gear") return cur;
      const personasAll = listModelPersonas(id).filter((p) => (p.modelId ?? "").trim());
      return personasAll.length < 2 ? null : cur;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="work-form-modal-overlay"
        aria-describedby={undefined}
        className={cn(
          "model-picker-dialog z-[var(--z-modal-app-content)] max-h-[min(92vh,880px)] w-full max-w-[min(880px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[min(880px,calc(100vw-2rem))]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <DialogTitle className="text-left text-lg font-semibold">选择模型</DialogTitle>
          <button type="button" className="icon-btn" title="关闭" onClick={() => handleOpenChange(false)}>
            ×
          </button>
        </div>

        <div className="model-picker model-picker--dialog">
          <div className="model-picker-body">
            <div className="model-picker-left" role="tablist" aria-label="模型列表">
              {(
                [
                  "openai",
                  "anthropic",
                  "gemini",
                  "doubao",
                  "zhipu",
                  "kimi",
                  "xiaomi",
                  "ollama",
                  "mlx",
                ] as AiProviderId[]
              ).map((id) => {
                const ui = PROVIDER_UI[id];
                const isCloud = !isLocalAiProvider(id);
                const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
                const active = pickerActive === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    data-provider={id}
                    aria-selected={active}
                    className={
                      "model-picker-item" +
                      (active ? " is-active" : "") +
                      (disabled ? " is-disabled" : "")
                    }
                    title={
                      disabled
                        ? `${ui.tip}（云端未开启：可查看介绍，确认使用请点右下角「使用」）`
                        : ui.tip
                    }
                    onClick={() => selectPickerActive(id)}
                  >
                    <AiProviderLogo provider={id} />
                    <span className="model-picker-item-main">
                      <span className="model-picker-item-title">{ui.label}</span>
                      <span className="model-picker-item-sub muted small">{ui.subtitle}</span>
                    </span>
                    <span className="model-picker-item-tag muted small">{settings.provider === id ? "当前" : ""}</span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const ui = PROVIDER_UI[pickerActive];
              const isCloud = !isLocalAiProvider(pickerActive);
              const disabled = isCloud && !(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
              return (
                <div className="model-picker-right" role="tabpanel" aria-label="模型介绍" data-provider={pickerActive}>
                  <div className="model-picker-right-scroll">
                    <div className="model-picker-right-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AiProviderLogo provider={pickerActive} />
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 18 }}>{ui.label}</div>
                          <div className="muted small">{ui.subtitle}</div>
                        </div>
                      </div>
                    </div>

                    <div className="model-picker-quote">{ui.quote}</div>
                    <div className="model-picker-core">{ui.core}</div>

                    <div className="model-picker-meters">
                      <div className="model-meter">
                        <div className="muted small">文采水平</div>
                        <Meter value={ui.meters.prose} />
                      </div>
                      <div className="model-meter">
                        <div className="muted small">指令遵从</div>
                        <Meter value={ui.meters.follow} />
                      </div>
                      <div className="model-meter">
                        <div className="muted small">字数消耗</div>
                        <Meter
                          value={
                          !isLocalAiProvider(pickerActive)
                            ? geminiCostStarsFromShensi(getProviderTemperature(settings, pickerActive))
                            : ui.meters.cost
                          }
                        />
                        {isLocalAiProvider(pickerActive) && ui.meters.costText ? (
                          <span className="muted small" style={{ marginLeft: 8 }}>
                            （{ui.meters.costText}）
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {(() => {
                      const cfg = getProviderConfig(settings, pickerActive);
                      const personas = listModelPersonas(pickerActive).filter((p) => p.modelId);
                      if (personas.length === 0) return null;
                      return (
                        <div className="model-persona">
                          <div style={{ fontWeight: 800, margin: "14px 0 8px" }}>推荐模型</div>
                          <div className="model-persona-grid" role="list" aria-label="推荐模型列表">
                            {personas.map((p) => {
                              const on = (cfg.model ?? "").trim() === p.modelId;
                              const stars = p.costStars ?? ui.meters.cost;
                              return (
                                <button
                                  key={p.modelId}
                                  type="button"
                                  role="listitem"
                                  className={"model-persona-card" + (on ? " is-on" : "")}
                                  title={p.modelId}
                                  onClick={() => {
                                    const cur = getProviderConfig(settings, pickerActive);
                                    updateSettings({ [pickerActive]: { ...cur, model: p.modelId } } as Partial<AiSettings>);
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
                                    <span className="model-persona-cost">
                                      {Array.from({ length: stars }).fill("★").join("")}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {pickerActive === "doubao" ? (
                            <p className="muted small" style={{ marginTop: 10, lineHeight: 1.55 }}>
                              当前展示：<strong>{doubaoModelDisplayLabel(getProviderConfig(settings, "doubao"))}</strong>
                              {(getProviderConfig(settings, "doubao").modelDisplayName ?? "").trim() ? (
                                <>
                                  <br />
                                  <span style={{ opacity: 0.88 }}>
                                    实际 endpoint：
                                    <code style={{ fontSize: "0.85em" }}>
                                      {(getProviderConfig(settings, "doubao").model ?? "").trim()}
                                    </code>
                                  </span>
                                </>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}

                    <div className="model-picker-note">
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>注意事项</div>
                      <div className="muted small" style={{ lineHeight: 1.65 }}>
                        {ui.note}
                      </div>
                    </div>
                  </div>

                  <div className="model-picker-tune model-picker-tune--dock">
                    <div
                      className="model-picker-tune-dock"
                      role="toolbar"
                      aria-label={
                        pickerActive === "gemini"
                          ? "观云调参"
                          : isLocalAiProvider(pickerActive)
                            ? "本地模型"
                            : "云端调参"
                      }
                    >
                      {(() => {
                        if (isLocalAiProvider(pickerActive)) return null;
                        const personasAll = listModelPersonas(pickerActive).filter((p) => (p.modelId ?? "").trim());
                        const gearPersonas = personasAll;
                        if (gearPersonas.length < 2) return null;

                        const activeModelId = (getProviderConfig(settings, pickerActive).model ?? "").trim();
                        const idx = Math.max(
                          0,
                          Math.min(
                            gearPersonas.length - 1,
                            Math.max(
                              0,
                              gearPersonas.findIndex((p) => (p.modelId ?? "").trim() === activeModelId),
                            ),
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
                                        const cur = getProviderConfig(settings, pickerActive);
                                        updateSettings({ [pickerActive]: { ...cur, model: m } } as Partial<AiSettings>);
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
                      })()}

                      {!isLocalAiProvider(pickerActive) ? (
                        <div className="model-picker-dock-anchor">
                          {modelPickerTune === "shensi" ? (
                            <div className="model-picker-mini-pop model-picker-mini-pop--shensi" role="dialog" aria-label="深思">
                              {(() => {
                                const t = getProviderTemperature(settings, pickerActive);
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
                                              updateSettings(patchProviderTemperature(settings, pickerActive, v));
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
                            handleOpenChange(false);
                            void navigate("/settings#ai-privacy");
                            return;
                          }
                          updateProvider(pickerActive);
                          handleOpenChange(false);
                        }}
                      >
                        使用
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
