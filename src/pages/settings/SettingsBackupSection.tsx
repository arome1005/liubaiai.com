/**
 * 数据备份 section：备份提醒 + 导入导出 + 备份周期开关。
 */
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import { formatBackupNudgeDetail, writeBackupReminderEnabled } from "../../util/backup-reminder";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsBackupSectionProps = {
  backupNudge: boolean;
  lastBackupExportMs: number | null;
  backupReminderOn: boolean;
  setBackupReminderOn: (v: boolean) => void;
  downloadBackup: () => Promise<void>;
  pickRestore: (mode: "replace" | "merge") => void;
};

export function SettingsBackupSection({
  backupNudge,
  lastBackupExportMs,
  backupReminderOn,
  setBackupReminderOn,
  downloadBackup,
  pickRestore,
}: SettingsBackupSectionProps) {
  return (
    <div id="backup-data" className="space-y-4">
      {backupNudge && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-500">备份提醒</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatBackupNudgeDetail(Date.now(), lastBackupExportMs)}
            </p>
          </div>
        </div>
      )}
      <SCard>
        <SHead title="本机备份" />
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">重要：</strong>作品与正文<strong>仅保存在本机浏览器</strong> IndexedDB 中，不会上传到服务器。换浏览器、清站点数据会<strong>丢失</strong>未备份的内容。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" onClick={() => void downloadBackup()}>导出备份（zip）</Button>
          <Button type="button" variant="outline" onClick={() => pickRestore("replace")}>从备份恢复（覆盖）</Button>
          <Button type="button" variant="outline" onClick={() => pickRestore("merge")}>合并导入备份</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          覆盖：清空当前库后写入备份。合并：追加备份中的作品（新 id），不删除当前数据。
        </p>
      </SCard>
      <SCard>
        <SRow
          iconBg="bg-purple-500"
          icon={<Save className="h-4 w-4" />}
          title="备份周期提醒"
          desc="约 30 天未记录导出时，在本页顶部显示提醒。"
        >
          <Toggle
            checked={backupReminderOn}
            onChange={(on) => {
              setBackupReminderOn(on);
              writeBackupReminderEnabled(on);
            }}
          />
        </SRow>
      </SCard>
    </div>
  );
}
