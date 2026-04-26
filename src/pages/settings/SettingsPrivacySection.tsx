/**
 * 隐私 section：诊断模式 + 协议链接。
 */
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsPrivacySectionProps = {
  diagnostic: boolean;
  setDiagnostic: (v: boolean) => void;
};

export function SettingsPrivacySection({ diagnostic, setDiagnostic }: SettingsPrivacySectionProps) {
  return (
    <div id="settings-privacy" className="space-y-4">
      <SCard>
        <SHead title="诊断与隐私" />
        <SRow
          iconBg="bg-rose-500"
          icon={<Shield className="h-4 w-4" />}
          title="诊断模式"
          desc="开启后错误边界在控制台输出完整堆栈，便于排查问题；默认关闭。"
        >
          <Toggle checked={diagnostic} onChange={setDiagnostic} />
        </SRow>
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
          <Link to="/privacy" className="text-primary no-underline hover:underline">隐私政策</Link>
          <span>·</span>
          <Link to="/terms" className="text-primary no-underline hover:underline">用户协议</Link>
        </div>
      </SCard>
    </div>
  );
}
