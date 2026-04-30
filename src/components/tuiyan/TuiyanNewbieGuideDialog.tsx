import { useId, useState } from "react"
import { BookOpen, CircleHelp } from "lucide-react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { TuiyanNewbieGuideContent } from "./TuiyanNewbieGuideContent"

/**
 * 推演台顶栏：新手指导入口 + 弹窗壳；长文案见 `TuiyanNewbieGuideContent`。
 */
export function TuiyanNewbieGuideDialog() {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
      >
        <CircleHelp className="h-3.5 w-3.5" />
        <span className="max-md:sr-only">新手指导</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[min(90vh,800px)] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton
        >
          <div className="shrink-0 space-y-2 border-b border-border/50 px-6 py-4">
            <DialogHeader>
              <DialogTitle id={titleId} className="flex items-center gap-2 pr-8 text-left text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                推演台：新手使用说明
              </DialogTitle>
              <DialogDescription className="text-left text-sm leading-relaxed">
                下面用「从做到哪、点哪里」的方式说明。不必一次全记住，用的时候再打开查即可。
              </DialogDescription>
            </DialogHeader>
          </div>
          <TuiyanNewbieGuideContent />
        </DialogContent>
      </Dialog>
    </>
  )
}
