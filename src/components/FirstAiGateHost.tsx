import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { registerFirstAiGateDialogOpener, settleFirstAiGate } from "../ai/first-ai-gate";
import { loadAiSettings, saveAiSettings } from "../ai/storage";

/**
 * 挂载于 `App`：与 `src/ai/client.ts` 中首次调用 LLM 前的 `requestFirstAiUseGate()` 配合。
 */
export function FirstAiGateHost() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    registerFirstAiGateDialogOpener(() => {
      setChecked(false);
      setOpen(true);
    });
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setOpen(false);
          settleFirstAiGate(false);
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        showCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>首次使用 AI 生成前请确认</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                留白写作用于<strong>虚构创作</strong>辅助。请勿将生成内容用于违法用途、现实伤害、冒充身份等。使用云端模型时，发送内容需符合各提供方政策。
              </p>
              <p>
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  用户协议
                </Link>
                {" · "}
                <Link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  隐私政策
                </Link>
                {" · "}
                <Link
                  to="/settings#fiction-creation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  设置中的说明
                </Link>
                <span className="block mt-1 text-xs">（新标签打开，不关闭本确认窗）</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>我已阅读并理解上述说明，同意使用本应用的 AI 功能</span>
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              settleFirstAiGate(false);
            }}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!checked}
            onClick={() => {
              // 同步开启全部 privacy 权限，避免各模块二次拦截
              try {
                const s = loadAiSettings();
                saveAiSettings({
                  ...s,
                  privacy: {
                    ...s.privacy,
                    consentAccepted: true,
                    allowCloudProviders: true,
                    allowMetadata: true,
                    allowChapterContent: true,
                  },
                });
              } catch { /* ignore */ }
              setOpen(false);
              settleFirstAiGate(true);
            }}
          >
            开始使用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
