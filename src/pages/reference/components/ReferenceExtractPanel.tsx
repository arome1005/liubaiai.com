import React from "react";
import { Button } from "../../../components/ui/button";
import { Wand2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ReferenceExtract, Work, ReferenceExtractType } from "../../../db/types";
import { EXTRACT_TYPES, getExtractTypeLabel } from "../../../ai/reference-extract";
import { parseReferenceKeyCardsFromExtractBody, type ReferenceKeyCard } from "../../../util/reference-key-cards";

interface ReferenceExtractPanelProps {
  activeRefId: string | null;
  extractPanelOpen: boolean;
  setExtractPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  extractType: ReferenceExtractType;
  setExtractType: (type: ReferenceExtractType) => void;
  extractStreaming: string;
  extractLoading: boolean;
  extractError: string | null;
  savedExtracts: ReferenceExtract[];
  extractAbortRef: React.MutableRefObject<AbortController | null>;
  importWorkId: string;
  setImportWorkId: (id: string) => void;
  importBusy: Record<string, boolean>;
  worksList: Work[];
  handleStartExtract: () => Promise<void>;
  handleImportExtract: (ex: ReferenceExtract) => Promise<void>;
  openPromptExtractFromBook: () => void;
  openConfirmDeleteExtract: (id: string) => void;
  applyKeyCardToWenceRefs: (card: ReferenceKeyCard) => void;
  jumpKeyCardToWritingHit: (card: ReferenceKeyCard) => Promise<void>;
  applyKeyCardToAiDraft: (card: ReferenceKeyCard) => Promise<void>;
  applyKeyCardToWork: (card: ReferenceKeyCard) => Promise<void>;
}

export function ReferenceExtractPanel({
  activeRefId,
  extractPanelOpen,
  setExtractPanelOpen,
  extractType,
  setExtractType,
  extractStreaming,
  extractLoading,
  extractError,
  savedExtracts,
  extractAbortRef,
  importWorkId,
  setImportWorkId,
  importBusy,
  worksList,
  handleStartExtract,
  handleImportExtract,
  openPromptExtractFromBook,
  openConfirmDeleteExtract,
  applyKeyCardToWenceRefs,
  jumpKeyCardToWritingHit,
  applyKeyCardToAiDraft,
  applyKeyCardToWork,
}: ReferenceExtractPanelProps) {
  return (
    <div className="reference-extract-section">
      <button
        type="button"
        className="reference-extract-toggle"
        onClick={() => setExtractPanelOpen((v) => !v)}
      >
        <span style={{ marginRight: 6 }}>✦</span>
        提炼要点
        <span style={{ marginLeft: "auto", fontSize: 11 }}>
          {extractPanelOpen ? "▲" : "▼"}
        </span>
      </button>

      {extractPanelOpen && (
        <div className="reference-extract-body">
          {/* 提炼提示词入口 B */}
          <div style={{ marginBottom: 10 }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/5"
              onClick={() => void openPromptExtractFromBook()}
              disabled={!activeRefId}
            >
              <Wand2 className="h-3.5 w-3.5" />
              提炼提示词（Beta）
            </Button>
          </div>
          {/* 类型选择 */}
          <div className="reference-extract-type-row">
            {EXTRACT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "reference-extract-type-btn",
                  extractType === t && "active",
                )}
                onClick={() => setExtractType(t)}
              >
                {getExtractTypeLabel(t as any)}
              </button>
            ))}
          </div>

          {/* 触发按钮 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Button
              type="button"
              size="sm"
              disabled={extractLoading}
              onClick={() => void handleStartExtract()}
            >
              {extractLoading ? "提炼中…" : `提炼「${getExtractTypeLabel(extractType as any)}」`}
            </Button>
            {extractLoading && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  extractAbortRef.current?.abort();
                }}
              >
                停止
              </Button>
            )}
          </div>

          {/* 错误提示 */}
          {extractError && (
            <p className="muted small" style={{ color: "var(--destructive)", marginBottom: 8 }}>
              ⚠ {extractError}
            </p>
          )}

          {/* 流式输出预览 */}
          {extractStreaming && (
            <div className="reference-extract-preview">
              <div className="reference-extract-preview-label muted small">提炼中（实时预览）…</div>
              <pre className="reference-extract-preview-body">{extractStreaming}</pre>
            </div>
          )}

          {/* 已保存的提炼结果 */}
          {savedExtracts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted small" style={{ marginBottom: 6 }}>
                已保存 {savedExtracts.length} 条提炼结果
              </div>

              {/* 导入作品选择器 */}
              <label className="reference-extract-import-row">
                <span className="small muted">导入到作品：</span>
                <select
                  className="input"
                  value={importWorkId}
                  onChange={(e) => setImportWorkId(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <option value="">选择作品…</option>
                  {worksList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              </label>

              <ul className="reference-extract-list">
                {savedExtracts.map((ex) => (
                  <li key={ex.id} className="reference-extract-item">
                    <div className="reference-extract-item-header">
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          flexShrink: 0,
                        }}
                      >
                        {getExtractTypeLabel(ex.type)}
                      </span>
                      <span className="muted small" style={{ flex: 1 }}>
                        {new Date(ex.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      {ex.importedBibleId && (
                        <span className="small" style={{ color: "var(--primary)" }}>
                          ✓ 已导入锦囊
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={importBusy[ex.id] || !!ex.importedBibleId}
                        onClick={() => void handleImportExtract(ex)}
                      >
                        {importBusy[ex.id] ? "导入中…" : ex.importedBibleId ? "已导入" : "导入锦囊"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openConfirmDeleteExtract(ex.id)}
                      >
                        删除
                      </Button>
                    </div>
                    {ex.type === "key_cards" ? (
                      <div className="reference-extract-item-body" style={{ whiteSpace: "normal" }}>
                        {(() => {
                          const cards = parseReferenceKeyCardsFromExtractBody(ex.body);
                          if (cards.length === 0) {
                            return (
                              <>
                                <div className="muted small" style={{ marginBottom: 6 }}>
                                  未解析到卡片 JSON（你可以删除后重新提炼一次「结构化要点卡片」）。
                                </div>
                                <pre className="reference-extract-item-body">{ex.body}</pre>
                              </>
                            );
                          }
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {cards.slice(0, 24).map((c, idx) => (
                                <div
                                  key={`${c.kind}:${c.title}:${idx}`}
                                  className="rounded-lg border border-border/50 bg-card/30 p-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs rounded-md border border-border/60 bg-background/60 px-2 py-0.5">
                                      {c.kind}
                                    </span>
                                    <div className="text-sm font-medium text-foreground">{c.title}</div>
                                    <div style={{ marginLeft: "auto" }}>
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => applyKeyCardToWenceRefs(c)}
                                        >
                                          去问策引用
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void jumpKeyCardToWritingHit(c)}
                                        >
                                          去写作定位
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void applyKeyCardToAiDraft(c)}
                                        >
                                          写入草稿
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => void applyKeyCardToWork(c)}
                                        >
                                          应用到作品
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  {c.sourceHint ? (
                                    <div className="muted small" style={{ marginTop: 4 }}>
                                      线索：{c.sourceHint}
                                    </div>
                                  ) : null}
                                  {c.tags?.length ? (
                                    <div className="muted small" style={{ marginTop: 4 }}>
                                      标签：{c.tags.join(" / ")}
                                    </div>
                                  ) : null}
                                  {c.body ? (
                                    <pre
                                      className="reference-extract-item-body"
                                      style={{ marginTop: 8, whiteSpace: "pre-wrap" }}
                                    >
                                      {c.body}
                                    </pre>
                                  ) : null}
                                </div>
                              ))}
                              {cards.length > 24 ? (
                                <div className="muted small">仅展示前 24 张卡片（防止页面过长）。</div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <pre className="reference-extract-item-body">{ex.body}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
