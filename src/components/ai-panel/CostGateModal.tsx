/**
 * P1-04 · 成本门控弹窗（写作侧栏）
 *
 * 替代原 `window.prompt` 方案，展示本次 token 估算与触发原因，
 * 提供「继续」/「取消」两个明确按钮。
 */

import { useEffect, useRef } from "react";
import { Button } from "../ui/button";
import {
  COST_GATE_BTN_CANCEL,
  COST_GATE_BTN_CONTINUE,
  COST_GATE_BTN_GOT_IT,
  COST_GATE_DISCLAIMER,
  COST_GATE_INFO_NO_THRESHOLD,
  COST_GATE_LABEL_AFTER_SEND_TOTAL,
  COST_GATE_LABEL_ROW_ESTIMATE,
  COST_GATE_LABEL_TODAY_USED,
  COST_GATE_TITLE_BLOCK_DEFAULT,
  COST_GATE_TITLE_INJECTION_INFO,
  COST_GATE_TOKEN_UNIT,
  formatCostGateQuantityShort,
  formatCostGateTokenAmount,
} from "../../util/ai-cost-gate-ui";

export type CostGatePayload = {
  reasons: string[];
  /** 本次请求估算 token 量 */
  tokensApprox: number;
  /** 今日已用（含本次估算前） */
  dailyUsed?: number;
  /** 日预算，0 = 未设置 */
  dailyBudget?: number;
  /** 触发来源描述 */
  triggerLabel?: string;
};

type Props = CostGatePayload & {
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * "block" 默认：阻断式，显示「取消」「继续发送」。
   * "info"：纯展示，仅显示「知道了」一个按钮，点击等同 onCancel/onConfirm（两者都会触发关闭）。
   */
  mode?: "block" | "info";
};

export function CostGateModal({
  reasons,
  tokensApprox,
  dailyUsed = 0,
  dailyBudget = 0,
  triggerLabel,
  onConfirm,
  onCancel,
  mode = "block",
}: Props) {
  const isInfo = mode === "info";
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const dailyAfter = dailyUsed + tokensApprox;
  const dailyPct = dailyBudget > 0 ? Math.round((dailyAfter / dailyBudget) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-gate-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--app-color-popover)",
          color: "var(--app-color-popover-foreground)",
          border: "1px solid var(--app-color-border)",
          borderRadius: 12,
          padding: "1.5rem",
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <h2
          id="cost-gate-title"
          style={{
            margin: "0 0 0.75rem",
            fontSize: "1rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: isInfo ? 0 : 8,
          }}
        >
          {!isInfo ? <span style={{ fontSize: "1.2rem" }}>⚠</span> : null}
          {triggerLabel ?? (isInfo ? COST_GATE_TITLE_INJECTION_INFO : COST_GATE_TITLE_BLOCK_DEFAULT)}
        </h2>

        <div
          style={{
            background: "var(--app-color-muted)",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--app-color-muted-foreground)" }}>
              {COST_GATE_LABEL_ROW_ESTIMATE}
            </span>
            <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{formatCostGateTokenAmount(tokensApprox)}</span>
          </div>
          {dailyUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--app-color-muted-foreground)" }}>
                {COST_GATE_LABEL_TODAY_USED}
              </span>
              <span style={{ fontSize: "0.9rem" }}>
                {formatCostGateQuantityShort(dailyUsed)} {COST_GATE_TOKEN_UNIT}
              </span>
            </div>
          )}
          {dailyBudget > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--app-color-muted-foreground)" }}>
                  {COST_GATE_LABEL_AFTER_SEND_TOTAL}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color:
                      dailyAfter > dailyBudget ? "var(--app-color-destructive)" : "var(--app-color-foreground)",
                  }}
                >
                  {formatCostGateQuantityShort(dailyAfter)} / {formatCostGateQuantityShort(dailyBudget)}{" "}
                  {COST_GATE_TOKEN_UNIT}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--app-color-border)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, dailyPct)}%`,
                    background:
                      dailyAfter > dailyBudget ? "var(--app-color-destructive)" : "var(--app-color-primary)",
                    borderRadius: 2,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </>
          )}
        </div>

        {reasons.length > 0 ? (
          <ul
            style={{
              margin: "0 0 1rem",
              padding: "0 0 0 1.1rem",
              fontSize: "0.82rem",
              color: "var(--app-color-muted-foreground)",
              lineHeight: 1.6,
            }}
          >
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : isInfo ? (
          <p
            style={{
              margin: "0 0 1rem",
              fontSize: "0.82rem",
              color: "var(--app-color-muted-foreground)",
              lineHeight: 1.6,
            }}
          >
            {COST_GATE_INFO_NO_THRESHOLD}
          </p>
        ) : null}

        <p style={{ margin: "0 0 1.2rem", fontSize: "0.75rem", color: "var(--app-color-muted-foreground)" }}>
          {COST_GATE_DISCLAIMER}
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {isInfo ? (
            <Button ref={cancelRef} type="button" size="sm" onClick={onConfirm}>
              {COST_GATE_BTN_GOT_IT}
            </Button>
          ) : (
            <>
              <Button ref={cancelRef} type="button" variant="outline" size="sm" onClick={onCancel}>
                {COST_GATE_BTN_CANCEL}
              </Button>
              <Button type="button" size="sm" onClick={onConfirm}>
                {COST_GATE_BTN_CONTINUE}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
