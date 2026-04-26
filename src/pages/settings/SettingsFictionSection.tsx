/**
 * 虚构创作声明 section：声明文本 + "已阅读"开关。
 */
import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { writeFictionCreationAcknowledged } from "../../ai/fiction-ack";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsFictionSectionProps = {
  fictionAck: boolean;
  setFictionAck: (v: boolean) => void;
};

export function SettingsFictionSection({ fictionAck, setFictionAck }: SettingsFictionSectionProps) {
  return (
    <div id="fiction-creation" className="space-y-4">
      <SCard>
        <SHead title="虚构创作声明" />
        <div className="rounded-lg border border-border/20 bg-background/20 p-3 text-xs leading-relaxed text-muted-foreground">
          本工具用于小说等<strong className="text-foreground">虚构创作</strong>辅助。请勿将生成内容用于违法用途、现实伤害、冒充身份等。使用云端模型时，发送内容需符合各提供方政策。
        </div>
        <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
          <Link to="/terms" className="text-primary no-underline hover:underline">用户协议</Link>
          <span>·</span>
          <Link to="/privacy" className="text-primary no-underline hover:underline">隐私政策</Link>
        </div>
      </SCard>
      <SCard>
        <SRow
          iconBg="bg-cyan-500"
          icon={<Lightbulb className="h-4 w-4" />}
          title="我已阅读并理解上述声明"
          desc="可选记录、便于留痕。未勾选不会禁止 AI 生成；首次生成前仍有弹窗确认。"
        >
          <Toggle
            checked={fictionAck}
            onChange={(on) => {
              setFictionAck(on);
              writeFictionCreationAcknowledged(on);
            }}
          />
        </SRow>
      </SCard>
    </div>
  );
}
