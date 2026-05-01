import * as React from "react";

export interface EditorFindReplaceBarProps {
  findQ: string;
  setFindQ: (v: string) => void;
  replaceQ: string;
  setReplaceQ: (v: string) => void;
  /** 当前匹配步进（0-based），UI 上显示为 step+1 */
  findStep: number;
  /** 章内匹配位置数组 */
  findPositions: number[];
  onFindNext: () => void;
  onReplaceFirst: () => void;
  onReplaceAll: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * 章节正文「查找/替换条」。
 * - 与原 EditorPage 中的 `<div className="find-bar find-bar--extended">` 完全等价：
 *   class、输入框 placeholder、按钮文案、Enter 跳下一处、autoFocus 行为、计数样式都不变。
 * - 可见性由父组件通过条件渲染控制（findOpen ? <Bar/> : null）。
 */
export function EditorFindReplaceBar(props: EditorFindReplaceBarProps): React.JSX.Element {
  const {
    findQ,
    setFindQ,
    replaceQ,
    setReplaceQ,
    findStep,
    findPositions,
    onFindNext,
    onReplaceFirst,
    onReplaceAll,
    onClose,
  } = props;

  return (
    <div className="find-bar find-bar--extended">
      <label className="find-label">查找</label>
      <input
        type="search"
        placeholder="章内文字（Enter 跳下一处）"
        value={findQ}
        onChange={(e) => setFindQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onFindNext();
          }
        }}
        autoFocus
      />
      <label className="find-label">替换为</label>
      <input
        type="text"
        placeholder="可为空"
        value={replaceQ}
        onChange={(e) => setReplaceQ(e.target.value)}
      />
      {findQ ? (
        <span className="find-count">
          {findPositions.length > 0 ? `${findStep + 1}/${findPositions.length}` : "0"}{" "}处
        </span>
      ) : null}
      <button type="button" className="btn small" onClick={onReplaceFirst}>
        替换当前
      </button>
      <button type="button" className="btn small" onClick={() => void onReplaceAll()}>
        全部替换
      </button>
      <button type="button" className="find-close" onClick={onClose}>
        关闭
      </button>
    </div>
  );
}
