/**
 * 推演节点结构化字段的 chip + 书斋联动展示组件。
 *
 * 主文件职责：
 *  - 字段配置（CHIP_FIELD_CONFIG）/ 章纲并排对（PAIRED_FIELDS）
 *  - 通用字段渲染壳：ChipField（人物/词条联动）/ TagChipField / ConflictField / CompactTextarea
 *  - 主组件 StructuredMetaChips：按 level 决定渲染哪些字段、并对支持联动的字段成对并列
 *
 * 单 chip 弹窗逻辑见 `chips/` 子目录：
 *  - LinkedCharacterChip / LinkedTermChip：已入库 chip + 编辑弹窗
 *  - UnlinkedChip：未入库 chip + 创建弹窗
 *  - AddChipInput：带自动补全的添加输入框
 */
import { useCallback, useState } from "react"
import { BookOpen, Flame, Gem, Hash, MapPin, Plus, Shield, Users, X } from "lucide-react"
import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel } from "../../db/types"
import { cn } from "../../lib/utils"
import { STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { CHARACTER_CONFIG } from "../../util/entry-kind-icon"
import { useNodeChipLibrary, type NodeChipLibrary } from "../../hooks/useNodeChipLibrary"
import { Textarea } from "../ui/textarea"
import { LinkedCharacterChip } from "./chips/LinkedCharacterChip"
import { LinkedTermChip } from "./chips/LinkedTermChip"
import { UnlinkedChip } from "./chips/UnlinkedChip"
import { AddChipInput } from "./chips/AddChipInput"
import { parseChips, serializeChips } from "./chips/shared"

// ── 字段配置 ──────────────────────────────────────────────────────────────────

type LibraryType = "character" | "glossaryTerm" | "tag" | "conflict" | "textarea"

type FieldChipConfig = {
  libraryType: LibraryType
  /** 词条字段：chip 图标 */
  icon?: React.ElementType
  /** 词条字段：chip 颜色 class */
  colorClass?: string
}

const CHIP_FIELD_CONFIG: Partial<Record<keyof PlanningNodeStructuredMeta, FieldChipConfig>> = {
  appearedCharacters: { libraryType: "character" },
  coreCharacters:     { libraryType: "character" },
  mainCharacters:     { libraryType: "character" },
  locations:    { libraryType: "glossaryTerm", icon: MapPin, colorClass: "text-sky-400" },
  keyLocations: { libraryType: "glossaryTerm", icon: MapPin, colorClass: "text-sky-400" },
  mainFactions: { libraryType: "glossaryTerm", icon: Shield, colorClass: "text-violet-400" },
  coreFactions: { libraryType: "glossaryTerm", icon: Shield, colorClass: "text-violet-400" },
  keyItems:          { libraryType: "glossaryTerm", icon: Gem,      colorClass: "text-amber-400" },
  worldSettingTerms: { libraryType: "glossaryTerm", icon: BookOpen, colorClass: "text-emerald-400" },
  tags:          { libraryType: "tag" },
  conflictPoints: { libraryType: "conflict" },
}

function getFieldConfig(key: keyof PlanningNodeStructuredMeta): FieldChipConfig {
  return CHIP_FIELD_CONFIG[key] ?? { libraryType: "textarea" }
}

// ── 章纲层级里需要并排显示的字段对 ───────────────────────────────────────────

const PAIRED_FIELDS: [keyof PlanningNodeStructuredMeta, keyof PlanningNodeStructuredMeta][] = [
  ["appearedCharacters", "locations"],
  ["mainCharacters",     "keyLocations"],
  ["mainFactions",       "coreFactions"],
]

// ── 通用 chip 字段（人物/地点/势力/道具） ────────────────────────────────────

function ChipField({
  value,
  onChange,
  disabled,
  library,
  config,
  label,
  sectionIcon: SectionIcon,
  sectionColor,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  library: NodeChipLibrary
  config: FieldChipConfig
  label: string
  sectionIcon: React.ElementType
  sectionColor: string
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const chips = parseChips(value)

  const suggestions =
    config.libraryType === "character" ? library.characterNames : library.termNames

  const removeChip = useCallback(
    (idx: number) => {
      onChange(serializeChips(chips.filter((_, i) => i !== idx)))
    },
    [chips, onChange],
  )

  const addChip = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (trimmed && !chips.includes(trimmed)) {
        onChange(serializeChips([...chips, trimmed]))
      }
      setAdding(false)
    },
    [chips, onChange],
  )

  const addToLibrary = useCallback(
    async (
      name: string,
      extra: {
        voiceNotes?: string
        motivation?: string
        gender?: import("../../db/types").BibleCharacter["gender"]
        note?: string
      },
    ) => {
      if (config.libraryType === "character") {
        await library.createCharacter(name, {
          voiceNotes: extra.voiceNotes,
          motivation: extra.motivation,
          gender: extra.gender,
        })
      } else if (config.libraryType === "glossaryTerm") {
        await library.createTerm(name, extra.note ?? "")
      }
    },
    [config, library],
  )

  // 词条字段用配置里嵌入的图标/颜色，人物字段用 CHARACTER_CONFIG
  const chipFieldIcon = config.libraryType === "character"
    ? CHARACTER_CONFIG.icon
    : (config.icon ?? SectionIcon)
  const chipFieldColor = config.libraryType === "character"
    ? CHARACTER_CONFIG.colorClass
    : (config.colorClass ?? sectionColor)

  return (
    <div className="rounded-xl border border-border/35 bg-gradient-to-b from-card/45 to-card/20 p-3.5 shadow-sm backdrop-blur-sm">
      <div className={cn("mb-2.5 flex items-center gap-1.5 text-xs font-semibold", sectionColor)}>
        <SectionIcon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((name, idx) => {
          if (config.libraryType === "character") {
            const char = library.findCharacter(name)
            return char ? (
              <LinkedCharacterChip
                key={char.id}
                name={name}
                character={char}
                onRemove={() => removeChip(idx)}
                disabled={disabled}
                onUpdate={library.updateCharacter}
              />
            ) : (
              <UnlinkedChip
                key={`unlinked-char-${name}-${idx}`}
                name={name}
                onRemove={() => removeChip(idx)}
                onAddToLibrary={(extra) => addToLibrary(name, extra)}
                chipType="character"
                fieldIcon={chipFieldIcon}
                fieldColor={chipFieldColor}
                disabled={disabled}
              />
            )
          } else {
            const term = library.findTerm(name)
            return term ? (
              <LinkedTermChip
                key={term.id}
                name={name}
                term={term}
                onRemove={() => removeChip(idx)}
                disabled={disabled}
                onUpdate={library.updateTerm}
                fieldIcon={chipFieldIcon}
                fieldColor={chipFieldColor}
              />
            ) : (
              <UnlinkedChip
                key={`unlinked-term-${name}-${idx}`}
                name={name}
                onRemove={() => removeChip(idx)}
                onAddToLibrary={(extra) => addToLibrary(name, extra)}
                chipType="glossaryTerm"
                fieldIcon={chipFieldIcon}
                fieldColor={chipFieldColor}
                disabled={disabled}
              />
            )
          }
        })}
        {!disabled && !adding && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/45 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground/70 shadow-sm transition hover:-translate-y-[1px] hover:border-border/70 hover:text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" />
            <span>添加</span>
          </button>
        )}
        {adding && (
          <AddChipInput
            suggestions={suggestions}
            onAdd={addChip}
            onCancel={() => setAdding(false)}
          />
        )}
        {chips.length === 0 && !adding && (
          <span className="text-xs text-muted-foreground/40">{placeholder ?? "暂无"}</span>
        )}
      </div>
    </div>
  )
}

// ── 标签字段（纯文本 chip，无库联动） ────────────────────────────────────────

function TagChipField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const [adding, setAdding] = useState(false)
  const chips = parseChips(value)

  const remove = (idx: number) => onChange(serializeChips(chips.filter((_, i) => i !== idx)))
  const add = (name: string) => {
    const t = name.replace(/^#/, "").trim()
    if (t && !chips.includes(t)) onChange(serializeChips([...chips, t]))
    setAdding(false)
  }

  return (
    <div className="rounded-xl border border-border/35 bg-gradient-to-b from-card/45 to-card/20 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="mb-2.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Hash className="h-3.5 w-3.5" />
        <span>标签</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full border border-border/45 bg-background/65 px-2.5 py-1 text-xs text-foreground/85 shadow-sm"
          >
            <span className="text-muted-foreground/60">#</span>
            {tag}
            {!disabled && (
              <button type="button" onClick={() => remove(idx)} className="opacity-50 hover:opacity-100">
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        {!disabled && !adding && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/45 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground/70 shadow-sm transition hover:-translate-y-[1px] hover:border-border/70"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" />
            <span>添加</span>
          </button>
        )}
        {adding && <AddChipInput suggestions={[]} onAdd={add} onCancel={() => setAdding(false)} />}
      </div>
    </div>
  )
}

// ── 冲突点字段（列表文本，无库联动） ─────────────────────────────────────────

function ConflictField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const items = parseChips(value)
  const [adding, setAdding] = useState(false)

  const remove = (idx: number) => onChange(serializeChips(items.filter((_, i) => i !== idx)))
  const add = (name: string) => {
    if (name && !items.includes(name)) onChange(serializeChips([...items, name]))
    setAdding(false)
  }

  return (
    <div className="rounded-xl border border-border/35 bg-gradient-to-b from-card/45 to-card/20 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-rose-400">
        <Flame className="h-3.5 w-3.5" />
        <span>冲突点</span>
      </div>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-1.5">
            <Flame className="mt-0.5 h-3 w-3 shrink-0 text-orange-400/70" />
            <span className="flex-1 text-xs text-foreground/85">{item}</span>
            {!disabled && (
              <button type="button" onClick={() => remove(idx)} className="shrink-0 opacity-40 hover:opacity-80">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {!disabled && !adding && (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground/80"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" />
            <span>添加冲突</span>
          </button>
        )}
        {adding && <AddChipInput suggestions={[]} onAdd={add} onCancel={() => setAdding(false)} />}
        {items.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground/40">暂无冲突点</p>
        )}
      </div>
    </div>
  )
}

// ── 紧凑 Textarea ─────────────────────────────────────────────────────────────

function CompactTextarea({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder?: string
  rows?: number
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-border/35 bg-gradient-to-b from-card/45 to-card/20 p-3.5 shadow-sm backdrop-blur-sm">
      <label className="text-[11px] font-medium text-muted-foreground/75">{label}</label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="resize-none border-border/35 bg-background/70 text-xs leading-relaxed shadow-inner focus-visible:ring-primary/20"
      />
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export type StructuredMetaChipsProps = {
  nodeId: string
  level: TuiyanPlanningLevel
  meta: PlanningNodeStructuredMeta | undefined
  workId: string | null
  disabled: boolean
  onChange: (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => void
  /** 外部变化时触发书斋库重新加载，以便自动入库后 chip 立即显示为已链接 */
  libraryRefreshKey?: number
}

export function StructuredMetaChips({
  nodeId,
  level,
  meta,
  workId,
  disabled,
  onChange,
  libraryRefreshKey,
}: StructuredMetaChipsProps) {
  const library = useNodeChipLibrary(workId, libraryRefreshKey)

  const handleChange = useCallback(
    (key: keyof PlanningNodeStructuredMeta, value: string) => {
      onChange(nodeId, { [key]: value })
    },
    [nodeId, onChange],
  )

  const fields = STRUCTURED_FIELDS_BY_LEVEL[level]
  if (!fields.length) return null

  const renderField = (key: keyof PlanningNodeStructuredMeta, label: string) => {
    const value = (meta?.[key] as string | undefined) ?? ""
    const cfg = getFieldConfig(key)

    if (cfg.libraryType === "tag") {
      return (
        <TagChipField
          key={key}
          value={value}
          onChange={(v) => handleChange(key, v)}
          disabled={disabled}
        />
      )
    }

    if (cfg.libraryType === "conflict") {
      return (
        <ConflictField
          key={key}
          value={value}
          onChange={(v) => handleChange(key, v)}
          disabled={disabled}
        />
      )
    }

    if (cfg.libraryType === "character" || cfg.libraryType === "glossaryTerm") {
      const isChar = cfg.libraryType === "character"
      const SectionIcon = isChar ? Users : (cfg.icon ?? Users)
      const sectionColor = isChar
        ? CHARACTER_CONFIG.colorClass
        : (cfg.colorClass ?? "text-muted-foreground")
      return (
        <ChipField
          key={key}
          value={value}
          onChange={(v) => handleChange(key, v)}
          disabled={disabled}
          library={library}
          config={cfg}
          label={label}
          sectionIcon={SectionIcon}
          sectionColor={sectionColor}
        />
      )
    }

    return (
      <CompactTextarea
        key={key}
        label={label}
        value={value}
        onChange={(v) => handleChange(key, v)}
        disabled={disabled}
        rows={2}
      />
    )
  }

  const fieldKeys = fields.map((f) => f.key)
  const pairs = PAIRED_FIELDS.filter(
    ([a, b]) =>
      fieldKeys.includes(a) &&
      fieldKeys.includes(b) &&
      getFieldConfig(a).libraryType !== "textarea" &&
      getFieldConfig(b).libraryType !== "textarea",
  )
  const pairedSet = new Set<keyof PlanningNodeStructuredMeta>()
  pairs.forEach(([a, b]) => { pairedSet.add(a); pairedSet.add(b) })

  const rendered: React.ReactNode[] = []
  const processedKeys = new Set<string>()

  for (const { key, label } of fields) {
    if (processedKeys.has(key)) continue
    const pairEntry = pairs.find(([a, b]) => a === key || b === key)
    if (pairEntry && pairedSet.has(key)) {
      const [keyA, keyB] = pairEntry
      const labelA = fields.find((f) => f.key === keyA)?.label ?? keyA
      const labelB = fields.find((f) => f.key === keyB)?.label ?? keyB
      rendered.push(
        <div key={`pair-${keyA}-${keyB}`} className="grid grid-cols-2 gap-2">
          {renderField(keyA, labelA)}
          {renderField(keyB, labelB)}
        </div>,
      )
      processedKeys.add(keyA)
      processedKeys.add(keyB)
    } else {
      rendered.push(renderField(key, label))
      processedKeys.add(key)
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-border/35 bg-gradient-to-b from-card/55 via-card/35 to-card/15 p-3.5 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.55)] backdrop-blur-sm md:p-4">
      <div className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary/85">
        结构化元数据
      </div>
      {rendered}
    </div>
  )
}
