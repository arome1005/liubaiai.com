import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { authMe, type AuthUser } from "../api/auth";
import { postTestSave } from "../api/testSave";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { getWork, listWorks } from "../db/repo";
import type { Work } from "../db/types";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import { liuguangQuickCaptureShortcutLabel } from "../util/keyboardHints";

const LS_LAST_WORK = "liubai:lastWorkId";

type HubModule = {
  to: string;
  label: string;
  hint: string;
  desc: string;
};

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
  const [resumeWork, setResumeWork] = useState<Work | null>(null);
  const [lastWorkResolved, setLastWorkResolved] = useState(false);

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

  useEffect(() => {
    if (!lastWorkId) {
      setResumeWork(null);
      setLastWorkResolved(true);
      return;
    }
    setLastWorkResolved(false);
    let cancelled = false;
    void getWork(lastWorkId).then((w) => {
      if (cancelled) return;
      setResumeWork(w ?? null);
      setLastWorkResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lastWorkId]);

  const hubModules: HubModule[] = useMemo(
    () => [
      { to: "/library", label: "留白", hint: "1", desc: "作品库：新建、导入、封面与留白标签。" },
      { to: "/logic", label: "推演", hint: "2", desc: "情节与结构推演（能力按路线图迭代）。" },
      {
        to: "/inspiration",
        label: "流光",
        hint: "3",
        desc: `灵感与素材；${liuguangQuickCaptureShortcutLabel()} 速记、AI 扩容、转入章节。`,
      },
      { to: "/chat", label: "问策", hint: "4", desc: "对话与策问。" },
      {
        to: "/luobi",
        label: "落笔",
        hint: "5",
        desc: "创作工具箱：提示词、锦囊、世界观、风格卡、词典等（无需先选作品即可进入）。",
      },
      { to: "/sheng-hui", label: "生辉", hint: "6", desc: "润色与生成相关能力。" },
      { to: "/reference", label: "藏经", hint: "7", desc: "摘录、标签与检索。" },
    ],
    [],
  );

  function persistLastWork(id: string) {
    try {
      localStorage.setItem(LS_LAST_WORK, id);
      setLastWorkId(id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn("page home-page flex flex-col gap-6")}>
      <section className="home-hero rounded-xl border border-border/40 bg-card/30 px-4 py-6 sm:px-8 sm:py-8 shadow-sm">
        <h1 className="home-title">留白写作</h1>
        <p className="home-sub muted">以空白起笔，让故事在安静里生长。</p>
        <p className="home-hero-hint muted small">下方模块与顶栏顺序、快捷键提示 1～7 一致。</p>
        <div className="home-hero-actions">
          <Button asChild variant="default">
            <Link to="/library">进入作品库</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/reference">打开藏经</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/settings">设置</Link>
          </Button>
        </div>
      </section>

      {resumeWork ? (
        <section className="home-section home-resume" aria-labelledby="home-resume-heading">
          <h2 id="home-resume-heading" className="home-section-title">
            继续创作
          </h2>
          <p className="muted small home-resume-lead">
            上次打开的作品：<strong>{resumeWork.title}</strong>。与顶栏右侧「最近 · 书名」共用同一记录。
          </p>
          <div className="home-resume-actions">
            <Button asChild variant="default">
              <Link to={`/work/${resumeWork.id}`}>进入写作</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/work/${resumeWork.id}/summary`}>概要</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/work/${resumeWork.id}/bible`}>锦囊</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/library">作品库</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {cloudUser ? (
        <section className="home-section rounded-xl border border-border/40 bg-card/30 px-4 py-5 sm:px-6 shadow-sm">
          <h2 className="home-section-title">云端同步测试</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            已登录为 <strong>{cloudUser.email}</strong>。点击下方按钮向服务器写入一条测试记录（需后端已启动）。
          </p>
          <div className="home-hero-actions">
            <Button
              type="button"
              variant="default"
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
            </Button>
          </div>
          {syncMsg ? <p className="muted small home-sync-msg">{syncMsg}</p> : null}
        </section>
      ) : null}

      <section
        className="home-section rounded-xl border border-border/40 bg-card/30 px-4 py-5 sm:px-6 shadow-sm"
        aria-labelledby="home-modules-heading"
      >
        <h2 id="home-modules-heading" className="home-section-title">
          模块入口
        </h2>
        <p className="muted small home-modules-intro">与主导航同一套路由，从首页也可直达。</p>
        <ul className="home-hub-grid">
          {hubModules.map((m) => (
            <li key={m.label}>
              <Card className="h-full gap-0 overflow-hidden border-border py-0 shadow-sm">
                <CardContent className="p-0">
                  <Link to={m.to} className="home-hub-card home-hub-card--flat">
                    <div className="home-hub-card-top">
                      <span className="home-hub-card-kbd" aria-hidden>
                        {m.hint}
                      </span>
                      <span className="home-hub-card-label">{m.label}</span>
                    </div>
                    <p className="home-hub-card-desc">{m.desc}</p>
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section rounded-xl border border-border/40 bg-card/30 px-4 py-5 sm:px-6 shadow-sm">
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
                  onClick={() => persistLastWork(w.id)}
                >
                  <span className="home-recent-title">{w.title}</span>
                  <span className="muted small home-recent-time">{formatRelativeUpdateMs(w.updatedAt)}</span>
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
        <span aria-hidden> · </span>
        <Link to="/settings">设置</Link>
      </footer>
    </div>
  );
}
