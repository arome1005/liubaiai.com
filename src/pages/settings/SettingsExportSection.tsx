/**
 * 导出 section：纯文本/Markdown 换行符。
 */
import { cn } from "../../lib/utils";
import type { LineEndingMode } from "../../util/lineEnding";
import { SCard, SHead } from "./_shared";

export type SettingsExportSectionProps = {
  lineEnding: LineEndingMode;
  setLineEnding: (v: LineEndingMode) => void;
};

export function SettingsExportSection({ lineEnding, setLineEnding }: SettingsExportSectionProps) {
  return (
    <div id="settings-export" className="space-y-4">
      <SCard>
        <SHead title="导出格式" sub="纯文本与 Markdown 导出时使用的换行符。" />
        <div className="grid grid-cols-2 gap-3">
          {([
            ["lf",   "LF（Unix / macOS）"],
            ["crlf", "CRLF（Windows）"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setLineEnding(v)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border-2 px-4 py-3 text-left transition-all",
                lineEnding === v
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60",
              )}
            >
              <span className="font-mono text-sm font-semibold">{v.toUpperCase()}</span>
              <span className="text-[11px]">{l}</span>
            </button>
          ))}
        </div>
      </SCard>
    </div>
  );
}
