import { type ReactNode, useId, useState } from "react"
import { BookOpen, CircleHelp } from "lucide-react"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { ScrollArea } from "../ui/scroll-area"
import { cn } from "../../lib/utils"

function GuideSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

/**
 * 推演台新手指导：与界面用语一致，面向未接触过「五层规划」的用户。
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
          <ScrollArea className="h-[min(64vh,560px)]">
            <div className="space-y-5 px-6 py-4 pr-4 text-sm leading-relaxed text-muted-foreground">
              <GuideSection title="推演台是干什么的？">
                <p>
                  可以把它理解成<strong className="font-medium text-foreground">在正式写章正文之前，先把整本书的骨架搭好</strong>
                  的地方：从一句话灵感，到全书走向、分卷、每章要发生什么，再可选地细到「章内镜头级」的详细细纲。搭好后可以一键
                  推到写作页，和正文、生辉等环节衔接。
                </p>
              </GuideSection>

              <GuideSection title="界面三块，分别管什么？">
                <ul className="ml-1 list-inside list-disc space-y-1.5 pl-0.5 marker:text-primary/80">
                  <li>
                    <span className="text-foreground">左：规划章纲</span> — 五层树形结构。从上到下依次是
                    总纲 → 一级大纲 → 二级卷纲 → 三级细纲 → 详细细纲。你在这里
                    <strong className="font-medium text-foreground">点选要编辑或要往下生成的那个节点</strong>。
                  </li>
                  <li>
                    <span className="text-foreground">中：主工作台</span> — 和顶上的「大纲 / 导图 / 文策」三个标签一起用：
                    <ul className="mt-1 list-inside list-[circle] space-y-1 pl-4 text-[13px]">
                      <li>「大纲」：编辑当前选中节点上的摘要/细纲等文字；</li>
                      <li>「导图」：用当前作品结构（优先五层规划）生成/浏览思维导图，便于看全局关系；</li>
                      <li>「文策」：放与作品相关的文策/备忘卡片（如金句、灵感、待用梗），和规划可对照着看。</li>
                    </ul>
                  </li>
                  <li>
                    <span className="text-foreground">右：详情（五层规划生成）</span> — 你写「总构思」、选模式与提示词、看预检、点
                    <strong className="font-medium text-foreground">大按钮做 AI 生成</strong>
                    的地方。生成结果会进左侧树，并在中间展示。
                  </li>
                </ul>
              </GuideSection>

              <GuideSection title="五层分别是什么？（从粗到细）">
                <ol className="ml-1 list-inside list-decimal space-y-1.5 pl-0.5 marker:font-medium marker:text-foreground">
                  <li>总纲：整本书的顶层设计（题材、主矛盾、大走向）。</li>
                  <li>一级大纲：把总纲拆成若干条大线（例如几条主线/大阶段），方便后面分卷。</li>
                  <li>二级卷纲：按「卷」拆剧情块，每卷有阶段目标、冲突等。</li>
                  <li>三级细纲：到「章」的提纲，每章要推进什么、伏笔与节奏。</li>
                  <li>详细细纲（可选）：某一章里更细的镜头/情节点，适合对单章要抠得很细时使用。</li>
                </ol>
                <p className="pt-1">
                  常见顺序是：先有总纲 → 再生成/整理一级 → 在某一集一级下生卷 → 在某一卷下生章
                  —— 和你在左侧树里<strong className="font-medium text-foreground">选中的位置</strong>、右侧
                  <strong className="font-medium text-foreground">高亮的下一步按钮</strong>是一致的。
                </p>
              </GuideSection>

              <GuideSection title="第一次来，建议这样点">
                <ol className="ml-1 list-inside list-decimal space-y-1.5 pl-0.5 marker:font-medium marker:text-foreground">
                  <li>在右侧大输入框里写好你的故事核（可以很长：人设、调性、禁忌、参考风格等），保存好。</li>
                  <li>需要时打开「高级」：设规模（如目标卷数、每卷章数、一级大线条数等）和字数档位；首次不懂可先留默认，以后再调。</li>
                  <li>在「预检」里快速看一眼：这次生成会参考哪些内容、有没有明显缺口。</li>
                  <li>在「模型一键」和「模板高级」之间二选一；模板侧还可搭配全局提示词样式。</li>
                  <li>点右侧与当前阶段对应的蓝色主按钮（如「生成总纲」）开始；生成中可终止重试。</li>
                  <li>到左侧树里点开下一层，选中节点后回到中间看/改，再继续向下生成，直到你满意为止。</li>
                </ol>
              </GuideSection>

              <GuideSection title="顶栏其它按钮是做什么的？">
                <ul className="ml-1 list-inside list-disc space-y-1.5 pl-0.5 marker:text-primary/80">
                  <li>返回写作：回到该作品的编辑页，写正文、章纲等。</li>
                  <li>进入生辉：跳转生辉工作台（会带上当前作品/章节的上下文，视入口而定），做仿写、成稿等。</li>
                  <li>书库图标（生成即入库）：打开时，把生成物自动纳入资料库等流程（具体以你当前项目逻辑为准），可按习惯开关。</li>
                  <li>设置：进入全局/推演相关设置，例如模型与隐私。</li>
                  <li>选模型 +「AI 生成」：和右侧主生成协同；顶栏「AI 生成」是快捷操作，大步骤仍以右侧五层规划按钮为准更不易乱。</li>
                </ul>
              </GuideSection>

              <GuideSection title="和「写作卷章」的关系">
                <p>
                  左侧可以<strong className="font-medium text-foreground">只做规划、暂时不写实体章节</strong>。当你需要把规划推到写作里、或要导图/正文联动时，请先在写作里建好卷和章节。中区若提示尚无卷章，按提示去写作补即可，不影响在推演里先把五层树搭好。
                </p>
              </GuideSection>

              <GuideSection title="常见问题">
                <ul className="ml-1 list-inside list-disc space-y-1.5 pl-0.5 marker:text-primary/80">
                  <li>「我改树里文字，会不会丢？」— 在节点上编辑的摘要/细纲以你保存的数据为准；重新生成会覆盖当次目标节点内容，重要段落可先复制备份。</li>
                  <li>「生成太长/太短」— 在高级里调规模与各层最低字数、或调整总构思里对篇幅与节奏的说明。</li>
                  <li>「点不动生成」— 看是否已选作品、右栏是否让当前层「下一步」可点、模型是否已配置。</li>
                </ul>
              </GuideSection>

              <p className="pt-1 text-xs text-muted-foreground/90">
                AI 输出需自行核对后使用。若界面文案与版本有细微差异，以你屏幕上实际按钮与菜单为准。
              </p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
