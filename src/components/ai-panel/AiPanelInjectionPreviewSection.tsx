import type { WritingMaterialInjectBlock } from "../../ai/assemble-context";

export function AiPanelInjectionPreviewSection(props: {
  includeBible: boolean;
  approxInjectChars: number;
  approxInjectTokens: number;
  bibleLoading: boolean;
  busy: boolean;
  injectBlocks: WritingMaterialInjectBlock[];
  onLoadBiblePreview: () => void;
  biblePreviewHasText: boolean;
}) {
  const p = props;
  return (
    <details className="ai-panel-box" open aria-labelledby="ai-panel-inject-preview-summary">
      <summary id="ai-panel-inject-preview-summary">注入预览（发送前看一眼）</summary>
      <div className="ai-panel-row" style={{ marginTop: 8 }}>
        <span className="muted small">
          预计注入：约 {p.approxInjectChars.toLocaleString()} 字 / ≈ {p.approxInjectTokens.toLocaleString()} tokens
        </span>
        {p.includeBible ? (
          <button type="button" className="btn small" disabled={p.bibleLoading || p.busy} onClick={() => p.onLoadBiblePreview()}>
            {p.bibleLoading ? "加载锦囊…" : p.biblePreviewHasText ? "刷新锦囊预览" : "加载锦囊预览"}
          </button>
        ) : null}
      </div>
      {p.injectBlocks.length === 0 ? (
        <p className="muted small">请先选择章节。</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {p.injectBlocks.map((b) => (
            <details key={b.id} className="ai-panel-box" style={{ margin: 0 }}>
              <summary>
                {b.title}
                <span className="muted small"> · {b.chars.toLocaleString()} 字</span>
                {b.note ? <span className="muted small"> · {b.note}</span> : null}
              </summary>
              <textarea readOnly value={b.content} rows={6} style={{ width: "100%", resize: "vertical", marginTop: 8 }} />
            </details>
          ))}
        </div>
      )}
    </details>
  );
}
