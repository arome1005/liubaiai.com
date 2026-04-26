/**
 * 存储 section：IndexedDB 配额条 + 刷新按钮。
 */
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { SCard, SHead } from "./_shared";

export type SettingsStorageSectionProps = {
  storageBytes: { usage: number; quota: number } | null;
  storageEstimate: string | null;
  refreshStorageQuota: () => void;
};

export function SettingsStorageSection({
  storageBytes,
  storageEstimate,
  refreshStorageQuota,
}: SettingsStorageSectionProps) {
  return (
    <div id="settings-storage" className="space-y-4">
      <SCard>
        <SHead title="存储配额（IndexedDB）" sub="浏览器为当前站点分配的上限，接近或占满时无法保存，请及时导出备份。" />
        {storageBytes && storageBytes.quota > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-foreground">
                {((storageBytes.usage / storageBytes.quota) * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground">{storageEstimate}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  storageBytes.usage / storageBytes.quota > 0.8 ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, (storageBytes.usage / storageBytes.quota) * 100)}%` }}
              />
            </div>
            {storageBytes.usage / storageBytes.quota > 0.8 && (
              <p className="text-xs text-destructive">已使用超过 80%，建议尽快导出备份或清理章节快照。</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{storageEstimate ?? "…"}</p>
        )}
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refreshStorageQuota()}>
          刷新占用
        </Button>
      </SCard>
    </div>
  );
}
