/**
 * P1-04 · 成本门控弹窗
 *
 * 替代原 `window.prompt` 方案，展示本次 token 粗估与触发原因，
 * 提供「继续」/「取消」两个明确按钮。
 *
 * 用法（deferred-promise 模式）：
 *   const ok = await openCostGate({ reasons, tokensApprox, dailyUsed, dailyBudget });
 */

import { useEffect, useRef } from "react";
import { Button } from "./ui/button";

export type CostGatePayload = {
  reasons: string[];
  /** 本次请求粗估 tokens */
  tokensApprox: number;
  /** 今日已用 tokens（含本次估算前） */
  dailyUsed?: number;
  /** 日预算 tokens，0 = 未设置 */
  dailyBudget?: number;
  /** 触发来源描述 */
  triggerLabel?: string;
};

type Props = CostGatePayload & {
  onConfirm: () => void;
  onCancel: () => void;
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function CostGateModal({
  reasons,
  tokensApprox,
  dailyUsed = 0,
  dailyBudget = 0,
  triggerLabel,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // ESC 键取消
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // 默认聚焦「取消」按钮，防止 Enter 键误确认
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
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        {/* 标题 */}
        <h2
          id="cost-gate-title"
          style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ fontSize: "1.2rem" }}>⚠</span>
          {triggerLabel ?? "AI 调用确认"}
        </h2>

        {/* token 用量卡片 */}
        <div
          style={{
            background: "var(--muted)",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>本次粗估</span>
            <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{fmt(tokensApprox)} tokens</span>
          </div>
          {dailyUsed > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>今日已用</span>
              <span style={{ fontSize: "0.9rem" }}>{fmt(dailyUsed)} tokens</span>
            </div>
          )}
          {dailyBudget > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.82rem", color: "var(--muted-foreground)" }}>发送后今日合计</span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: dailyAfter > dailyBudget ? "var(--destructive)" : "var(--foreground)",
                  }}
                >
                  {fmt(dailyAfter)} / {fmt(dailyBudget)} tokens
                </span>
              </div>
              {/* 进度条 */}
              <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, dailyPct)}%`,
                    background: dailyAfter > dailyBudget ? "var(--destructive)" : "var(--primary)",
                    borderRadius: 2,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* 触发原因 */}
        {reasons.length > 0 && (
          <ul style={{ margin: "0 0 1rem", padding: "0 0 0 1.1rem", fontSize: "0.82rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        {/* 免责声明 */}
        <p style={{ margin: "0 0 1.2rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          粗估仅供参考，非厂商计费凭证。不同提供商单价差异较大，请以实际账单为准。
        </p>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
          >
            继续发送
          </Button>
        </div>
      </div>
    </div>
  );
}
