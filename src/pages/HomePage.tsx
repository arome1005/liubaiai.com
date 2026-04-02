import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { authMe, type AuthUser } from "../api/auth";
import { postTestSave } from "../api/testSave";
import { listWorks } from "../db/repo";
import type { Work } from "../db/types";

const LS_LAST_WORK = "liubai:lastWorkId";

export function HomePage() {
  const [cloudUser, setCloudUser] = useState<AuthUser | null | undefined>(undefined);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
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
      try {
        const { user } = await authMe();
        if (!cancelled) setCloudUser(user);
      } catch {
        if (!cancelled) setCloudUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {cloudUser ? (
        <section className="home-section">
          <h2 className="home-section-title">云端同步测试</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            已登录为 <strong>{cloudUser.email}</strong>。点击下方按钮向服务器写入一条测试记录（需后端已启动）。
          </p>
          <div className="home-hero-actions">
            <button
              type="button"
              className="btn primary"
              disabled={syncBusy}
              onClick={() => {
                setSyncMsg(null);
                setSyncBusy(true);
                void (async () => {
                  try {
                    const text = `留白同步测试 ${new Date().toISOString()}`;
                    const res = await postTestSave(text);
                    setSyncMsg(
                      `已写入：记录 id ${res.row.id.slice(0, 8)}…（用户 ${res.userId.slice(0, 8)}…）`,
                    );
                  } catch (e) {
                    setSyncMsg(e instanceof Error ? e.message : "请求失败");
                  } finally {
                    setSyncBusy(false);
                  }
                })();
              }}
            >
              {syncBusy ? "提交中…" : "同步测试"}
            </button>
          </div>
          {syncMsg ? <p className="muted small home-sync-msg">{syncMsg}</p> : null}
        </section>
      ) : null}

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
