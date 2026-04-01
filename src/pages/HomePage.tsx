import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { listWorks } from "../db/repo";
import type { Work } from "../db/types";

const LS_LAST_WORK = "liubai:lastWorkId";

export function HomePage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [lastWorkId, setLastWorkId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_LAST_WORK);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listWorks();
      if (!cancelled) setWorks(list.slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featureLinks = useMemo(() => {
    const plotTo = lastWorkId ? `/work/${lastWorkId}/bible` : "/library";
    return [
      { to: "/library", label: "留白" },
      { to: "/logic", label: "推演" },
      { to: "/inspiration", label: "流光" },
      { to: "/chat", label: "问策" },
      { to: plotTo, label: "落笔" },
      { to: "/sheng-hui", label: "生辉" },
      { to: "/reference", label: "藏经" },
    ];
  }, [lastWorkId]);

  return (
    <div className="page home-page">
      <section className="home-hero">
        <h1 className="home-title">留白写作</h1>
        <p className="home-sub muted">以空白起笔，让故事在安静里生长。</p>
        <div className="home-hero-actions">
          <Link to="/library" className="btn primary">
            进入作品库
          </Link>
          <Link to="/reference" className="btn ghost">
            打开藏经
          </Link>
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-section-title">快捷入口</h2>
        <ul className="home-feature-grid">
          {featureLinks.map((f) => (
            <li key={f.label}>
              <Link to={f.to} className="home-feature-card">
                <span className="home-feature-label">{f.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-title">最近作品</h2>
          <Link to="/library" className="muted small">
            全部作品 →
          </Link>
        </div>
        {works.length === 0 ? (
          <p className="muted small home-empty">暂无作品，请从作品库新建或导入。</p>
        ) : (
          <ul className="home-recent-list">
            {works.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/work/${w.id}`}
                  className="home-recent-card"
                  onClick={() => {
                    try {
                      localStorage.setItem(LS_LAST_WORK, w.id);
                      setLastWorkId(w.id);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <span className="home-recent-title">{w.title}</span>
                  <span className="muted small">更新 {new Date(w.updatedAt).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="home-foot muted small">
        <Link to="/privacy">隐私</Link>
        <span aria-hidden> · </span>
        <Link to="/terms">协议</Link>
      </footer>
    </div>
  );
}
