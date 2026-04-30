import { Lock } from "lucide-react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"

export type BackendAdvancedConfigGateDialogProps = {
  open: boolean
  onDismiss: () => void
  pin: string
  onPinInput: (value: string) => void
  error: string | null
  onConfirm: () => void
}

/**
 * 打开「高级后端配置」前的一次性密码门闩；状态与确认逻辑在 `useBackendAdvancedConfigGate`。
 */
export function BackendAdvancedConfigGateDialog({
  open,
  onDismiss,
  pin,
  onPinInput,
  error,
  onConfirm,
}: BackendAdvancedConfigGateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="sm:max-w-sm" showCloseButton onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            高级后端配置
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-muted-foreground">
            请输入密码以打开「高级后端配置」弹窗。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder="密码"
            value={pin}
            onChange={(e) => onPinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onConfirm()
              }
            }}
            className="font-mono"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            取消
          </Button>
          <Button type="button" size="sm" onClick={onConfirm}>
            解锁
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
