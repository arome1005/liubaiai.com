/**
 * 推演节点结构化字段的 chip + 书斋联动展示组件。
 *
 * - 已入库的人物/词条 chip → 点击弹出可编辑 popover（字段与书斋人物卡/词条卡一致）
 * - 未入库 chip → 点击弹出创建表单，填写基本信息后"确认入库"
 * - 标签/冲突点字段保留原有纯文本编辑方式
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { BookOpen, Flame, Gem, Hash, MapPin, Plus, Shield, Users, X } from "lucide-react"
import type {
  BibleCharacter,
  BibleGlossaryTerm,
  PlanningNodeStructuredMeta,
  TuiyanPlanningLevel,
} from "../../db/types"
import { cn } from "../../lib/utils"
import { STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { CHARACTER_CONFIG } from "../../util/entry-kind-icon"
import { useNodeChipLibrary, type NodeChipLibrary } from "../../hooks/useNodeChipLibrary"
import { Textarea } from "../ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

// ── 文本解析/序列化 ────────────────────────────────────────────────────────────

function parseChips(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function serializeChips(chips: string[]): string {
  return chips.join("\n")
}

// ── 字段配置 ──────────────────────────────────────────────────────────────────

type LibraryType = "character" | "glossaryTerm" | "tag" | "conflict" | "textarea"

type FieldChipConfig = {
  libraryType: LibraryType
  /** 词条字段：入库时的默认类别 */
  defaultCategory?: BibleGlossaryTerm["category"]
  /** 词条字段：chip 图标 */
  icon?: React.ElementType
  /** 词条字段：chip 颜色 class */
  colorClass?: string
}

const CHIP_FIELD_CONFIG: Partial<Record<keyof PlanningNodeStructuredMeta, FieldChipConfig>> = {
  appearedCharacters: { libraryType: "character" },
  coreCharacters:     { libraryType: "character" },
  mainCharacters:     { libraryType: "character" },
  locations:    { libraryType: "glossaryTerm", defaultCategory: "name",  icon: MapPin, colorClass: "text-sky-400" },
  keyLocations: { libraryType: "glossaryTerm", defaultCategory: "name",  icon: MapPin, colorClass: "text-sky-400" },
  mainFactions: { libraryType: "glossaryTerm", defaultCategory: "term",  icon: Shield, colorClass: "text-violet-400" },
  coreFactions: { libraryType: "glossaryTerm", defaultCategory: "term",  icon: Shield, colorClass: "text-violet-400" },
  keyItems:          { libraryType: "glossaryTerm", defaultCategory: "term",  icon: Gem,      colorClass: "text-amber-400" },
  worldSettingTerms: { libraryType: "glossaryTerm", defaultCategory: "term",  icon: BookOpen, colorClass: "text-emerald-400" },
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

// ── 类别标签映射（书斋词条 category → 中文显示） ──────────────────────────────

const CATEGORY_LABELS: Record<BibleGlossaryTerm["category"], string> = {
  name: "人名·地名",
  term: "术语",
  dead: "死亡角色",
}

// ── 共用：popover 容器样式 ────────────────────────────────────────────────────

const POPOVER_LABEL = "mb-0.5 text-[10px] text-muted-foreground/70"
const POPOVER_TEXTAREA =
  "w-full resize-none rounded border border-border/30 bg-background/40 px-2 py-1 text-xs leading-relaxed outline-none focus:border-primary/40"
const SAVE_BTN =
  "rounded px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50"

// ── 已入库：人物 chip ─────────────────────────────────────────────────────────

type CharGender = BibleCharacter["gender"]

const GENDER_LABELS: Record<NonNullable<CharGender>, string> = {
  male: "男", female: "女", unknown: "未知", none: "无",
}

function LinkedCharacterChip({
  name,
  character,
  onRemove,
  disabled,
  onUpdate,
}: {
  name: string
  character: BibleCharacter
  onRemove: () => void
  disabled: boolean
  onUpdate: (id: string, patch: Partial<Pick<BibleCharacter, "voiceNotes" | "motivation" | "gender">>) => Promise<void>
}) {
  const { icon: Icon, colorClass } = CHARACTER_CONFIG
  const [open, setOpen] = useState(false)
  const [voiceNotes, setVoiceNotes] = useState(character.voiceNotes ?? "")
  const [motivation, setMotivation] = useState(character.motivation ?? "")
  const [gender, setGender] = useState<CharGender>(character.gender ?? "unknown")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVoiceNotes(character.voiceNotes ?? "")
    setMotivation(character.motivation ?? "")
    setGender(character.gender ?? "unknown")
  }, [character.id, open])

  const isDirty =
    voiceNotes !== (character.voiceNotes ?? "") ||
    motivation !== (character.motivation ?? "") ||
    gender !== (character.gender ?? "unknown")

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      await onUpdate(character.id, { voiceNotes, motivation, gender })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/50",
            "bg-background/40 px-2 py-0.5 text-xs transition-colors hover:bg-muted/40",
            colorClass,
          )}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span>{name}</span>
          {!disabled && (
            <span
              role="button"
              aria-label="移除"
              className="ml-0.5 rounded-full p-0.5 opacity-50 hover:bg-muted/60 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-xs" align="start">
        {/* 标题行 */}
        <div className="mb-3 flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", colorClass)} />
          <span className="font-medium text-foreground">{character.name}</span>
          <span className="ml-auto shrink-0 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            人物
          </span>
        </div>
        {/* 性别 */}
        <div className="mb-2">
          <p className={POPOVER_LABEL}>性别</p>
          <div className="flex gap-1">
            {(["male", "female", "unknown", "none"] as const).map((g) => (
              <button
                key={g}
                type="button"
                disabled={disabled}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] border transition-colors",
                  gender === g
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/30 bg-background/30 text-muted-foreground/70 hover:border-border/50",
                )}
                onClick={() => setGender(g)}
              >
                {GENDER_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
        {/* 角色性格（voiceNotes） */}
        <div className="mb-2">
          <p className={POPOVER_LABEL}>
            角色性格
            <span className="ml-1 opacity-50">{voiceNotes.length}/300</span>
          </p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={2}
            maxLength={300}
            placeholder="输入角色性格…"
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            disabled={disabled}
          />
        </div>
        {/* 角色信息（motivation） */}
        <div className="mb-3">
          <p className={POPOVER_LABEL}>
            角色信息
            <span className="ml-1 opacity-50">{motivation.length}/1000</span>
          </p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={3}
            maxLength={1000}
            placeholder="输入角色信息（剧情用到的背景）…"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            disabled={disabled}
          />
        </div>
        {/* 保存按钮 */}
        {!disabled && (
          <div className="flex items-center justify-end gap-2">
            {isDirty && (
              <span className="text-[10px] text-amber-400/80">有未保存更改</span>
            )}
            <button
              type="button"
              className={SAVE_BTN}
              onClick={save}
              disabled={!isDirty || saving}
            >
              {saving ? "保存中…" : isDirty ? "保存到书斋" : "已同步"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── 已入库：词条 chip ─────────────────────────────────────────────────────────

function LinkedTermChip({
  name,
  term,
  onRemove,
  disabled,
  onUpdate,
  fieldIcon: FieldIcon,
  fieldColor,
}: {
  name: string
  term: BibleGlossaryTerm
  onRemove: () => void
  disabled: boolean
  onUpdate: (id: string, patch: Partial<Pick<BibleGlossaryTerm, "note" | "category">>) => Promise<void>
  fieldIcon: React.ElementType
  fieldColor: string
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(term.note ?? "")
  const [category, setCategory] = useState<BibleGlossaryTerm["category"]>(term.category)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNote(term.note ?? "")
    setCategory(term.category)
  }, [term.id, open])

  const isDirty = note !== (term.note ?? "") || category !== term.category

  const save = async () => {
    if (!isDirty || saving) return
    setSaving(true)
    try {
      await onUpdate(term.id, { note, category })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/50",
            "bg-background/40 px-2 py-0.5 text-xs transition-colors hover:bg-muted/40",
            fieldColor,
          )}
        >
          <FieldIcon className="h-3 w-3 shrink-0" />
          <span>{name}</span>
          {!disabled && (
            <span
              role="button"
              aria-label="移除"
              className="ml-0.5 rounded-full p-0.5 opacity-50 hover:bg-muted/60 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        {/* 标题行 */}
        <div className="mb-3 flex items-center gap-1.5">
          <FieldIcon className={cn("h-3.5 w-3.5 shrink-0", fieldColor)} />
          <span className="font-medium text-foreground">{term.term}</span>
          <span className="ml-auto shrink-0 rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {CATEGORY_LABELS[term.category]}
          </span>
        </div>
        {/* 类别 */}
        <div className="mb-2">
          <p className={POPOVER_LABEL}>类别</p>
          <select
            className="w-full rounded border border-border/30 bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/40 disabled:opacity-50"
            value={category}
            onChange={(e) => setCategory(e.target.value as BibleGlossaryTerm["category"])}
            disabled={disabled}
          >
            <option value="name">人名·地名</option>
            <option value="term">术语</option>
            <option value="dead">死亡角色</option>
          </select>
        </div>
        {/* 备注 */}
        <div className="mb-3">
          <p className={POPOVER_LABEL}>备注</p>
          <textarea
            className={POPOVER_TEXTAREA}
            rows={3}
            placeholder="释义、设定约束、与剧情相关的注意事项…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled}
          />
        </div>
        {/* 保存按钮 */}
        {!disabled && (
          <div className="flex items-center justify-end gap-2">
            {isDirty && (
              <span className="text-[10px] text-amber-400/80">有未保存更改</span>
            )}
            <button
              type="button"
              className={SAVE_BTN}
              onClick={save}
              disabled={!isDirty || saving}
            >
              {saving ? "保存中…" : isDirty ? "保存到书斋" : "已同步"}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── 未入库 chip（弹出创建表单） ────────────────────────────────────────────────

function UnlinkedChip({
  name,
  onRemove,
  disabled,
  onAddToLibrary,
  chipType,
  fieldIcon: FieldIcon,
  fieldColor,
  defaultCategory,
}: {
  name: string
  onRemove: () => void
  disabled: boolean
  onAddToLibrary: (extra: {
    voiceNotes?: string
    motivation?: string
    gender?: CharGender
    note?: string
    category?: BibleGlossaryTerm["category"]
  }) => Promise<void>
  chipType: "character" | "glossaryTerm"
  fieldIcon: React.ElementType
  fieldColor: string
  defaultCategory?: BibleGlossaryTerm["category"]
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // 人物字段
  const [voiceNotes, setVoiceNotes] = useState("")
  const [motivation, setMotivation] = useState("")
  const [gender, setGender] = useState<CharGender>("unknown")
  // 词条字段
  const [note, setNote] = useState("")
  const [category, setCategory] = useState<BibleGlossaryTerm["category"]>(
    defaultCategory ?? "term",
  )

  // 重置表单
  useEffect(() => {
    if (!open) {
      setVoiceNotes("")
      setMotivation("")
      setGender("unknown")
      setNote("")
      setCategory(defaultCategory ?? "term")
    }
  }, [open, defaultCategory])

  const handleCreate = async () => {
    setCreating(true)
    try {
      if (chipType === "character") {
        await onAddToLibrary({ voiceNotes, motivation, gender })
      } else {
        await onAddToLibrary({ note, category })
      }
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const typeLabel = chipType === "character" ? "人物" : CATEGORY_LABELS[category]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border/40 bg-background/20 px-2 py-0.5 text-xs text-muted-foreground/70 hover:border-border/60 hover:text-muted-foreground/90"
          role="button"
        >
          <FieldIcon className={cn("h-3 w-3 shrink-0", fieldColor)} />
          <span>{name}</span>
          <span className="ml-0.5 rounded-full border border-border/30 px-1 py-0 text-[10px] opacity-60">
            入库
          </span>
          {!disabled && (
            <span
              role="button"
              aria-label="移除"
              className="ml-0.5 rounded-full p-0.5 opacity-40 hover:opacity-80"
              onClick={(e) => { e.stopPropagation(); onRemove() }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-3 text-xs", chipType === "character" ? "w-72" : "w-64")}
        align="start"
      >
        {/* 标题行 */}
        <div className="mb-3 flex items-center gap-1.5">
          <FieldIcon className={cn("h-3.5 w-3.5 shrink-0", fieldColor)} />
          <span className="font-medium text-foreground">{name}</span>
          <span className="ml-auto shrink-0 rounded-full border border-dashed border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {typeLabel} · 未入库
          </span>
        </div>

        {chipType === "character" ? (
          <>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>性别</p>
              <div className="flex gap-1">
                {(["male", "female", "unknown", "none"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] border transition-colors",
                      gender === g
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/30 bg-background/30 text-muted-foreground/70 hover:border-border/50",
                    )}
                    onClick={() => setGender(g)}
                  >
                    {GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>角色性格（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={2}
                maxLength={300}
                placeholder="性格特点、口吻风格…"
                value={voiceNotes}
                onChange={(e) => setVoiceNotes(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <p className={POPOVER_LABEL}>角色信息（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={3}
                maxLength={1000}
                placeholder="背景、动机等剧情用得到的信息…"
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mb-2">
              <p className={POPOVER_LABEL}>类别</p>
              <select
                className="w-full rounded border border-border/30 bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/40"
                value={category}
                onChange={(e) => setCategory(e.target.value as BibleGlossaryTerm["category"])}
              >
                <option value="name">人名·地名</option>
                <option value="term">术语</option>
                <option value="dead">死亡角色</option>
              </select>
            </div>
            <div className="mb-3">
              <p className={POPOVER_LABEL}>备注（可选）</p>
              <textarea
                className={POPOVER_TEXTAREA}
                rows={3}
                placeholder="释义、设定约束、与剧情相关的注意事项…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          type="button"
          className="w-full rounded bg-primary/15 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? "入库中…" : "确认入库"}
        </button>
      </PopoverContent>
    </Popover>
  )
}

// ── 带自动补全的添加输入框 ────────────────────────────────────────────────────

function AddChipInput({
  suggestions,
  onAdd,
  onCancel,
}: {
  suggestions: string[]
  onAdd: (value: string) => void
  onCancel: () => void
}) {
  const [inputVal, setInputVal] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = inputVal.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(inputVal.toLowerCase())).slice(0, 6)
    : []

  const confirm = (val?: string) => {
    const v = (val ?? inputVal).trim()
    if (v) onAdd(v)
    else onCancel()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confirm() }
          if (e.key === "Escape") { e.preventDefault(); onCancel() }
          if (e.key === ",") { e.preventDefault(); confirm() }
        }}
        onBlur={() => { if (!inputVal.trim()) onCancel() }}
        placeholder="输入名称…"
        className="h-6 w-28 rounded-full border border-border/50 bg-background/40 px-2.5 text-xs outline-none focus:border-primary/50"
      />
      {filtered.length > 0 && (
        <div className="absolute left-0 top-7 z-50 w-44 rounded-md border border-border/40 bg-popover shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full px-2.5 py-1.5 text-left text-xs text-foreground/85 hover:bg-muted/50"
              onMouseDown={(e) => { e.preventDefault(); confirm(s) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
        note?: string
        category?: BibleGlossaryTerm["category"]
      },
    ) => {
      if (config.libraryType === "character") {
        await library.createCharacter(name, {
          voiceNotes: extra.voiceNotes,
          motivation: extra.motivation,
          gender: extra.gender,
        })
      } else if (config.libraryType === "glossaryTerm") {
        await library.createTerm(
          name,
          extra.category ?? config.defaultCategory,
          extra.note,
        )
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
    <div className="rounded-lg border border-border/30 bg-card/10 p-3">
      <div className={cn("mb-2 flex items-center gap-1.5 text-xs font-medium", sectionColor)}>
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
                defaultCategory={config.defaultCategory}
                disabled={disabled}
              />
            )
          }
        })}
        {!disabled && !adding && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/40 px-2 py-0.5 text-xs text-muted-foreground/60 hover:border-border/60 hover:text-muted-foreground"
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
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Hash className="h-3.5 w-3.5" />
        <span>标签</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-foreground/80"
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/40 px-2 py-0.5 text-xs text-muted-foreground/60 hover:border-border/60"
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
    <div className="rounded-lg border border-border/30 bg-card/10 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-400">
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
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground/70">{label}</label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="resize-none border-border/30 bg-background/20 text-xs leading-relaxed"
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
  const fields = STRUCTURED_FIELDS_BY_LEVEL[level]
  if (!fields.length) return null

  const library = useNodeChipLibrary(workId, libraryRefreshKey)

  const handleChange = useCallback(
    (key: keyof PlanningNodeStructuredMeta, value: string) => {
      onChange(nodeId, { [key]: value })
    },
    [nodeId, onChange],
  )

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
    <div className="mt-4 space-y-3 rounded-xl border border-border/30 bg-card/10 p-3 md:p-4">
      <div className="text-xs font-medium text-muted-foreground">结构化元数据</div>
      {rendered}
    </div>
  )
}
