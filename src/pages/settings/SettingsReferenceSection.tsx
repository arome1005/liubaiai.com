/**
 * 藏经 section：重建索引 + 清空藏经数据。
 */
import { Button } from "../../components/ui/button";
import { clearAllReferenceLibraryData, rebuildAllReferenceSearchIndex } from "../../db/repo";
import { SCard, SHead } from "./_shared";

export type SettingsReferenceSectionProps = {
  refMaintainPct: number | null;
  setRefMaintainPct: (n: number | null) => void;
  refMaintainLabel: string | null;
  setRefMaintainLabel: (s: string | null) => void;
  setMsg: (s: string | null) => void;
};

export function SettingsReferenceSection({
  refMaintainPct,
  setRefMaintainPct,
  refMaintainLabel,
  setRefMaintainLabel,
  setMsg,
}: SettingsReferenceSectionProps) {
  return (
    <div id="settings-reference" className="space-y-4">
      <SCard>
        <SHead title="藏经维护" sub="仅作用于藏经（导入的原著与摘录），不会删除作品正文。" />
        <p className="mb-3 text-xs text-muted-foreground">
          若升级后检索异常，可先重建索引；仍异常再考虑清空藏经后重新导入。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={refMaintainPct !== null}
            onClick={() => {
              void (async () => {
                setRefMaintainPct(0);
                setRefMaintainLabel("准备…");
                try {
                  await rebuildAllReferenceSearchIndex((p) => {
                    setRefMaintainPct(p.percent);
                    setRefMaintainLabel(p.label ?? "");
                  });
                  setMsg("藏经索引已重建。");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "重建失败");
                } finally {
                  setRefMaintainPct(null);
                  setRefMaintainLabel(null);
                }
              })();
            }}
          >
            重建藏经索引
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={refMaintainPct !== null}
            onClick={() => {
              if (!window.confirm("将清空全部藏经数据，不影响作品正文。不可撤销。确定？")) return;
              void (async () => {
                try {
                  await clearAllReferenceLibraryData();
                  setMsg("已清空藏经。");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "清空失败");
                }
              })();
            }}
          >
            清空藏经
          </Button>
        </div>
        {refMaintainPct !== null && (
          <div className="mt-3 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, refMaintainPct)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{refMaintainLabel ?? ""}</p>
          </div>
        )}
      </SCard>
    </div>
  );
}
