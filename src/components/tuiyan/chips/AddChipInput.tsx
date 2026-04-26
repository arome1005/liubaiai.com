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
        className="h-6 w-28 rounded-full border border-border/50 bg-background/40 px-2.5 text-xs outline-none focus:border-primary/50"
      />
      {filtered.length > 0 && (
        <div className="absolute left-0 top-7 z-50 w-44 rounded-md border border-border/40 bg-popover shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full px-2.5 py-1.5 text-left text-xs text-foreground/85 hover:bg-muted/50"
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
