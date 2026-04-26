import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Props = {
  /** 0-100；调用方根据加载阶段控制目标值 */
  targetPercent: number
  /** 完成后从 DOM 移除的回调 */
  onExited?: () => void
}

const R = 42
const CIRC = 2 * Math.PI * R

export function FullscreenLoader({ targetPercent, onExited }: Props) {
  const [pct, setPct] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const rafRef = useRef<number>(0)
  const doneRef = useRef(false)
  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited

  // 平滑跟随 targetPercent
  useEffect(() => {
    const step = () => {
      setPct((cur) => {
        const diff = targetPercent - cur
        if (Math.abs(diff) < 0.3) return targetPercent
        const next = cur + Math.max(diff * 0.08, Math.sign(diff) * 0.3)
        return targetPercent > cur ? Math.min(next, targetPercent) : Math.max(next, targetPercent)
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [targetPercent])

  useEffect(() => {
    if (pct >= 100 && !doneRef.current) {
      doneRef.current = true
      const t1 = setTimeout(() => setOpacity(0), 60)
      const t2 = setTimeout(() => onExitedRef.current?.(), 400)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [pct])

  const displayPct = Math.min(100, Math.round(pct))
  const strokeDashoffset = CIRC * (1 - displayPct / 100)

  return createPortal(
    <div
      aria-label="加载中"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--app-color-background, #f8fafc)",
        opacity,
        transition: "opacity 0.32s ease",
        pointerEvents: opacity < 1 ? "none" : "auto",
      }}
    >
      <svg
        width="96"
        height="96"
        viewBox="0 0 100 100"
        aria-hidden
      >
        {/* 轨道 */}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--app-color-border, #e0e0e0)"
          strokeWidth="5"
        />
        {/* 进度弧 */}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--app-color-primary, #2c5aa0)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
        />
        {/* 百分比 */}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="15"
          fontWeight="500"
          fill="var(--app-color-foreground, #333333)"
          fontFamily="inherit"
        >
          {displayPct}%
        </text>
      </svg>
    </div>,
    document.body,
  )
}
