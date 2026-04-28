import type { ReferenceLibraryEntry, TuiyanReferenceBinding, TuiyanReferencePolicy } from "../db/types"
import { hasEffectiveReferenceStrategy, TUIYAN_IMITATION_MODE_OPTIONS } from "./tuiyan-reference-policy"

function imitationLabel(mode: TuiyanReferencePolicy["imitationMode"]): string {
  return TUIYAN_IMITATION_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? String(mode)
}

/**
 * 供规划详情主生成按钮上方展示的「本次参考装配」只读摘要（多行短句，无大段原文）。
 */
export function formatTuiyanReferenceAssemblySummary(args: {
  /** `planningIdea.trim().length` */
  planningIdeaTrimmedLength: number
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[]
  referencePolicy: TuiyanReferencePolicy
  refLibrary: ReferenceLibraryEntry[]
  /** 装配层补充行（如参考书未在库中） */
  assemblyGuardLines?: string[]
}): string[] {
  const { planningIdeaTrimmedLength, linkedRefWorkIds, referenceBindings, referencePolicy, refLibrary } = args
  const extra = args.assemblyGuardLines?.filter((s) => s.trim()) ?? []
  const byId = new Map(refLibrary.map((r) => [r.id, r]))

  const ideaLine =
    planningIdeaTrimmedLength > 0
      ? `构思：已填约 ${planningIdeaTrimmedLength} 字（会随本层生成进入上下文）`
      : "构思：未填写或为空（可先写作品构思以稳定输出）"

  if (!linkedRefWorkIds.length) {
    return [ideaLine, "参考：未关联藏经书目（本次按普通规划，不注入参考策略）。", ...extra]
  }

  const n = linkedRefWorkIds.length
  const inLinked = (b: TuiyanReferenceBinding) => linkedRefWorkIds.includes(b.refWorkId)
  const primaryN = referenceBindings.filter((b) => inLinked(b) && b.role === "primary").length
  const secondaryN = referenceBindings.filter((b) => inLinked(b) && b.role === "secondary").length
  const titles = linkedRefWorkIds.map((id) => byId.get(id)?.title?.trim() || "未命名").slice(0, 5)
  const titleSuffix = n > 5 ? ` 等共 ${n} 部` : ""
  const head = `参考：已关联 ${n} 部（主 ${primaryN} / 辅 ${secondaryN}）— ${titles.join("、")}${titleSuffix}`

  const mode = `模式：${imitationLabel(referencePolicy.imitationMode)}；构思优先：${referencePolicy.conceptFirst ? "开" : "关"}`

  if (!hasEffectiveReferenceStrategy(linkedRefWorkIds, referenceBindings)) {
    return [
      ideaLine,
      head,
      "策略未生效：请为每本已关联书至少勾选一个「作用维度」，或检查配置是否已保存。",
      mode,
      ...extra,
    ]
  }

  const anti = (referencePolicy.antiPatterns ?? "").trim()
  const antiLine = anti ? "反向约束：已填写" : "反向约束：无"

  const sectionAnchorTotal = referenceBindings
    .filter((b) => inLinked(b) && b.rangeMode === "selected_sections")
    .reduce((acc, b) => acc + (b.sectionIds?.length ?? 0), 0)

  const lines: string[] = [ideaLine, head, mode, antiLine]
  if (sectionAnchorTotal > 0) {
    lines.push(`指定章节：已勾选共 ${sectionAnchorTotal} 个章节锚点（各书范围见策略块）。`)
  }
  lines.push("强约束：仅学表达与结构，不复述参考剧情链。")
  return [...lines, ...extra]
}
