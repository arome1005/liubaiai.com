import { Link } from "react-router-dom";
import { Scan, Settings, Undo2 } from "lucide-react";

/** 写作顶栏左侧：返回主页 + 沉浸写作 */
export function TopbarEditorLeftNav({
  zenWrite,
  onZenToggle,
}: {
  zenWrite: boolean;
  onZenToggle: () => void;
}) {
  return (
    <>
      <Link to="/library" className="app-editor-topicon-link" aria-label="返回主页" title="返回主页">
        <Undo2 className="size-[1.15rem] shrink-0" strokeWidth={2.25} aria-hidden />
      </Link>
      <button
        type="button"
        className={"app-editor-topicon-link" + (zenWrite ? " is-on" : "")}
        aria-label={zenWrite ? "退出沉浸写作" : "沉浸写作"}
        aria-pressed={zenWrite}
        title={
          zenWrite
            ? "退出沉浸：结束浏览器全屏（Esc 也可）"
            : "沉浸写作：浏览器全屏专心码字；保留顶栏、章栏与右栏；Alt+Z 切换"
        }
        onClick={onZenToggle}
      >
        <Scan className="size-[1.15rem] shrink-0" strokeWidth={2.25} aria-hidden />
      </button>
    </>
  );
}

/** 写作顶栏右侧：写作设置 */
export function TopbarEditorSettingsIcon({ onSettingsOpen }: { onSettingsOpen: () => void }) {
  return (
    <button
      type="button"
      className="app-editor-topicon-link"
      aria-label="写作设置"
      title="写作设置"
      onClick={onSettingsOpen}
    >
      <Settings className="size-[1.15rem] shrink-0" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
