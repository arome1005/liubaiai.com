import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createWork, deleteWork, listWorks } from "../db/repo";
import type { Work } from "../db/types";
import { importWorkFromFile } from "../storage/import-work";

export function LibraryPage() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setWorks(await listWorks());
  }

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleNew() {
    const title = window.prompt("作品标题", "新作品");
    if (title === null) return;
    const w = await createWork(title);
    await refresh();
    window.location.href = `/work/${w.id}`;
  }

  function openImportPicker() {
    fileRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    try {
      const w = await importWorkFromFile(file);
      // 先结束「导入中」：refresh/listWorks 若较慢或挂起，不应一直锁按钮
      setImportBusy(false);
      setWorks((prev) => (prev.some((x) => x.id === w.id) ? prev : [w, ...prev]));
      void refresh().catch(() => {});
      navigate(`/work/${w.id}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "导入失败");
      setImportBusy(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("删除作品及全部章节？不可恢复（除非已有备份）。")) return;
    await deleteWork(id);
    await refresh();
  }

  if (loading) {
    return (
      <div className="page library-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="page library-page">
      <header className="page-header">
        <h1>作品库</h1>
        <div className="header-actions">
          <button type="button" className="btn primary" onClick={() => void handleNew()}>
            新建作品
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={importBusy}
            onClick={openImportPicker}
          >
            {importBusy ? "导入中…" : "导入作品"}
          </button>
          <input
            ref={fileRef}
            name="importWorkFile"
            type="file"
            accept=".txt,.md,.markdown,.docx,text/plain"
            className="visually-hidden"
            aria-hidden
            onChange={(ev) => void handleImportFile(ev)}
          />
        </div>
      </header>
      <p className="import-hint muted small">
        支持从 <strong>.txt</strong>、<strong>.md</strong>、<strong>.docx</strong> 导入为新作品。Markdown
        可用「## 章节名」分章；纯文本也会尝试按「第X章/回/卷、序章、楔子、后记…」自动切章；首行「# 书名」
        可作为作品标题。.doc 请先另存为 .docx。
      </p>
      {works.length === 0 ? (
        <p className="empty-hint">还没有作品，点「新建作品」或「导入作品」开始。</p>
      ) : (
        <ul className="work-list">
          {works.map((w) => (
            <li key={w.id}>
              <Link to={`/work/${w.id}`} className="work-card">
                <span className="work-title">{w.title}</span>
                <span className="work-meta">
                  更新 {new Date(w.updatedAt).toLocaleString()}
                </span>
              </Link>
              <Link to={`/work/${w.id}/bible`} className="btn ghost small" title="创作圣经">
                圣经
              </Link>
              <button
                type="button"
                className="btn danger small"
                title="删除"
                onClick={(e) => void handleDelete(w.id, e)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
