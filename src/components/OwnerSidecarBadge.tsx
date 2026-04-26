/**
 * 右下角小徽章：当本地直连（高级）已配置时，显示 sidecar 健康状态。
 * - 绿："● Claude 订阅直连"
 * - 红："● Sidecar 离线，已 fallback"
 * 隐藏：未同意条款 / 未启用 / 没填 token。
 *
 * 主要价值：避免你以为在白嫖订阅、其实在烧 API。
 */
import { useEffect, useState } from "react";
import {
  ownerModeAllowedSync,
  probeSidecar,
} from "../util/owner-mode";

type State = "hidden" | "live" | "down";

const PROBE_INTERVAL_MS = 30_000;

export function OwnerSidecarBadge() {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        if (!ownerModeAllowedSync()) {
          if (alive) setState("hidden");
          return;
        }
        const ok = await probeSidecar(true);
        if (alive) setState(ok ? "live" : "down");
      } catch {
        if (alive) setState("hidden");
      }
    };

    void tick();
    const id = setInterval(() => void tick(), PROBE_INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (state === "hidden") return null;

  const isLive = state === "live";
  const bg = isLive ? "rgba(16, 185, 129, 0.14)" : "rgba(244, 63, 94, 0.16)";
  const fg = isLive ? "#047857" : "#9f1239";
  const dot = isLive ? "#10b981" : "#f43f5e";
  const text = isLive ? "Claude 订阅直连" : "Sidecar 离线，已 fallback";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: bg,
        color: fg,
        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.08)",
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
          display: "inline-block",
        }}
      />
      <span>{text}</span>
    </div>
  );
}
