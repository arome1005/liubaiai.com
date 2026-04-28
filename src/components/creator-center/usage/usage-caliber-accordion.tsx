"use client";

import { FileText, Calculator, HardDrive, HelpCircle, Lock } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { Badge } from "../../ui/badge";

export function UsageCaliberAccordion() {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm">
      <div className="border-b border-border/30 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium tracking-tight">口径与隐私说明</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground/80">理解不同统计口径的含义，以及数据存储方式</p>
      </div>

      <Accordion type="multiple" className="px-4 sm:px-5">
        <AccordionItem value="api" className="border-border/30">
          <AccordionTrigger className="py-4 text-sm hover:no-underline">
            <span className="flex items-center gap-3">
              <div className="rounded-md bg-chart-1/10 p-1.5">
                <FileText className="size-3.5 text-chart-1" />
              </div>
              <span className="font-medium">API 计费口径</span>
              <Badge variant="secondary" className="ml-1 bg-chart-1/10 text-[10px] font-normal text-chart-1">
                推荐
              </Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="ml-9 space-y-2.5">
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-1">•</span>
                <span>
                  数据来源于各厂商返回的 <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[11px]">usage</code>{" "}
                  字段， 最接近实际计费口径。
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-1">•</span>
                <span>OpenAI、Anthropic、Google 等主流厂商均支持；本地模型通常不返回此字段。</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-1">•</span>
                <span>最终账单以厂商后台为准，本统计仅作参考。</span>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="approx" className="border-border/30">
          <AccordionTrigger className="py-4 text-sm hover:no-underline">
            <span className="flex items-center gap-3">
              <div className="rounded-md bg-chart-3/10 p-1.5">
                <Calculator className="size-3.5 text-chart-3" />
              </div>
              <span className="font-medium">粗估口径</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="ml-9 space-y-2.5">
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-3">•</span>
                <span>CJK 字符按 ~2 token/字，ASCII 按 ~4 char/token 启发式估算。</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-3">•</span>
                <span>适用于本地模型、流式中断、或厂商未返回 usage 的场景。</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-3">•</span>
                <span>
                  <strong className="text-foreground">非计费凭证</strong>，仅供快速了解消耗规模。
                </span>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="accumulate" className="border-border/30">
          <AccordionTrigger className="py-4 text-sm hover:no-underline">
            <span className="flex items-center gap-3">
              <div className="rounded-md bg-chart-2/10 p-1.5">
                <HardDrive className="size-3.5 text-chart-2" />
              </div>
              <span className="font-medium">累计逻辑</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="ml-9 space-y-2.5">
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-2">•</span>
                <span>
                  <strong className="text-foreground">今日/日预算</strong>：每日 00:00 重置， 写入 localStorage。
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-2">•</span>
                <span>
                  <strong className="text-foreground">本会话</strong>：标签页生命周期， 写入 sessionStorage。
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-2">•</span>
                <span>
                  <strong className="text-foreground">终身累计</strong>：自首次使用起的粗估总量， 仅在本机，可在设置中重置。
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-2">•</span>
                <span>
                  同一会话内可能同时存在 API 与粗估数据，
                  <strong className="text-foreground">不可简单相加</strong>。
                </span>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="privacy" className="border-b-0">
          <AccordionTrigger className="py-4 text-sm hover:no-underline">
            <span className="flex items-center gap-3">
              <div className="rounded-md bg-chart-4/10 p-1.5">
                <Lock className="size-3.5 text-chart-4" />
              </div>
              <span className="font-medium">隐私与存储</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="ml-9 space-y-2.5">
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-4">•</span>
                <span>
                  所有用量统计<strong className="text-foreground">仅存储在本机浏览器</strong>， 不会上传到任何服务器。
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-4">•</span>
                <span>清除浏览器数据将同时清除用量记录。</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-chart-4">•</span>
                <span>若启用「观云」等功能，上下文内容的处理遵循对应 AI 提供方的隐私政策。</span>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
