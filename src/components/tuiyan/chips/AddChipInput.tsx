/**
 * 带自动补全的添加输入框：
 * - Enter / "," 提交
 * - Esc 取消
 * - blur 且为空 → 取消
 * - 根据 suggestions 列表实时筛选并展示候选下拉
 */
import { useEffect, useRef, useState } from "react";

export type AddChipInputProps = {
  suggestions: string[];
  onAdd: (value: string) => void;
  onCancel: () => void;
};

export function AddChipInput({ suggestions, onAdd, onCancel }: AddChipInputProps) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = inputVal.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(inputVal.toLowerCase())).slice(0, 6)
    : [];

  const confirm = (val?: string) => {
    const v = (val ?? inputVal).trim();
    if (v) onAdd(v);
    else onCancel();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confirm(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          if (e.key === ",") { e.preventDefault(); confirm(); }
        }}
        onBlur={() => { if (!inputVal.trim()) onCancel(); }}
        placeholder="输入名称…"
        className="h-7 w-32 rounded-full border border-border/45 bg-background/75 px-3 text-xs shadow-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
      {filtered.length > 0 && (
        <div className="absolute left-0 top-8 z-50 w-48 rounded-lg border border-border/40 bg-popover/95 p-1 shadow-xl backdrop-blur">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-foreground/85 transition hover:bg-muted/60"
              onMouseDown={(e) => { e.preventDefault(); confirm(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
