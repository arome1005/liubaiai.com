import { Sparkles } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "../ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

type Mode = "polish" | "rewrite";

/**
 * 包一层正文可编辑区：有选区时方可打开生辉子菜单；选区以 CodeMirror 为准（见 getSelectedText）。
 */
export function EditorShengHuiContextSurface({
  enabled,
  getSelectedText,
  onShengHui,
  children,
}: {
  enabled: boolean;
  getSelectedText: () => string;
  onShengHui: (mode: Mode) => void;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return <>{children}</>;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onContextMenuCapture={(e) => {
            if (!getSelectedText().trim()) e.preventDefault();
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[10rem]">
        <ContextMenuLabel>生辉</ContextMenuLabel>
        <ContextMenuItem onSelect={() => onShengHui("polish")}>润色本段</ContextMenuItem>
        <ContextMenuItem onSelect={() => onShengHui("rewrite")}>重写本段</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * 与内联工具栏同风格：生辉下拉（带选区后跳转 / 行为见父级 hook）。
 */
export function EditorShengHuiToolbarMenu({ disabled, onShengHui }: { disabled: boolean; onShengHui: (mode: Mode) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn("icon-btn editor-xy-inline-icon", disabled && "pointer-events-none opacity-40")}
          title="在生辉中处理选区"
          disabled={disabled}
          aria-label="在生辉中处理选区"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]" side="bottom" sideOffset={4}>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">生辉</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onShengHui("polish")}>润色本段</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onShengHui("rewrite")}>重写本段</DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 pb-1.5 text-[10px] leading-snug text-muted-foreground">将选区作为仿写主稿带入生辉（需先选中正文）。</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
