import type { HotkeyCombo } from "./hotkey-config";

export type HotkeyConflict = {
  level: "error" | "warn";
  message: string;
};

function canonical(h: HotkeyCombo): string {
  const mods = [
    h.ctrl ? "C" : "",
    h.meta ? "M" : "",
    h.alt ? "A" : "",
    h.shift ? "S" : "",
  ].filter(Boolean);
  return `${mods.join("+")}+${h.code}`;
}

// zenToggle 已移至 hotkey-config.ts 可配置，不再列于静态列表
const APP_HOTKEYS: Array<{ id: string; label: string; combo: HotkeyCombo }> = [
  { id: "commandPalette", label: "全局命令面板", combo: { ctrl: true, meta: true, alt: false, shift: false, code: "KeyK" } },
  // 上面表示"Mod+K"，匹配时会用平台规则判断（见 detectAppHotkeyConflict）
  { id: "editorSave", label: "写作页保存/快照", combo: { ctrl: true, meta: true, alt: false, shift: false, code: "KeyS" } },
];

function isMacUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function detectAppHotkeyConflict(target: HotkeyCombo): HotkeyConflict[] {
  const out: HotkeyConflict[] = [];
  for (const h of APP_HOTKEYS) {
    if (h.id === "commandPalette" || h.id === "editorSave") {
      // "Mod+K / Mod+S"：Mac=meta，其余=ctrl
      const mac = isMacUA();
      const modTarget: HotkeyCombo = {
        alt: h.combo.alt,
        shift: h.combo.shift,
        ctrl: mac ? false : true,
        meta: mac ? true : false,
        code: h.combo.code,
      };
      if (canonical(modTarget) === canonical(target)) {
        out.push({ level: "error", message: `与应用内快捷键冲突：${h.label}` });
      }
      continue;
    }
    if (canonical(h.combo) === canonical(target)) {
      out.push({ level: "error", message: `与应用内快捷键冲突：${h.label}` });
    }
  }
  return out;
}

function detectSystemHotkeyConflict(target: HotkeyCombo): HotkeyConflict[] {
  const out: HotkeyConflict[] = [];
  const mac = isMacUA();

  // 常见浏览器/系统保留：尽量给"可能无效/不建议\"的提示，不强行禁止。
  const isMod = mac ? target.meta : target.ctrl;
  if (isMod && !target.alt) {
    if (target.code === "KeyW") out.push({ level: "warn", message: "可能与关闭标签页（Mod+W）冲突" });
    if (target.code === "KeyR") out.push({ level: "warn", message: "可能与刷新（Mod+R）冲突" });
    if (target.code === "KeyL") out.push({ level: "warn", message: "可能与地址栏聚焦（Mod+L）冲突" });
    if (target.code === "KeyT") out.push({ level: "warn", message: "可能与新建标签页（Mod+T）冲突" });
    if (target.code === "KeyN") out.push({ level: "warn", message: "可能与新窗口（Mod+N）冲突" });
    if (target.code === "KeyP") out.push({ level: "warn", message: "可能与打印（Mod+P）冲突" });
    if (target.code === "KeyF") out.push({ level: "warn", message: "可能与查找（Mod+F）冲突" });
  }

  if (mac && target.meta && target.code === "KeyQ") out.push({ level: "warn", message: "可能与退出应用（⌘Q）冲突" });
  if (mac && target.meta && target.code === "KeyH") out.push({ level: "warn", message: "可能与隐藏窗口（⌘H）冲突" });

  // 单修饰键风险
  if (target.code.startsWith("Key") && !target.ctrl && !target.meta && !target.alt) {
    out.push({ level: "warn", message: "不建议使用\"单按键\"作为全局快捷键，易误触" });
  }
  return out;
}

export function detectHotkeyConflicts(target: HotkeyCombo): HotkeyConflict[] {
  return [...detectAppHotkeyConflict(target), ...detectSystemHotkeyConflict(target)];
}

