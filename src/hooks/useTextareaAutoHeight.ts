import { useEffect, useRef } from "react"

/**
 * 让 textarea 高度随 `value` 变长/变短，不依赖内部滚动条（需配合 resize-none + overflow-hidden）。
 */
export function useTextareaAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}
