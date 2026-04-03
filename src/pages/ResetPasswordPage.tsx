import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSupabase } from "../lib/supabase";

function errLabel(msg: string): string {
  const map: Record<string, string> = {
    WEAK_PASSWORD: "密码至少 8 位",
    SESSION_MISSING: "请先通过邮件中的链接打开本页",
    UPDATE_FAILED: "更新密码失败，请重试或重新申请重置",
  };
  return map[msg] ?? msg;
}

export function ResetPasswordPage() {
  const [search] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = import.meta.env.VITE_SUPABASE_URL?.trim();
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
      if (!url || !anon) {
        if (!cancelled) setMsg("未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。");
        return;
      }
      const supabase = getSupabase();

      const code = search.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) setMsg(errLabel("SESSION_MISSING"));
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        const hash = window.location.hash.replace(/^#/, "");
        if (hash) {
          const p = new URLSearchParams(hash);
          const access_token = p.get("access_token");
          const refresh_token = p.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              if (!cancelled) setMsg(errLabel("SESSION_MISSING"));
              return;
            }
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) setSessionReady(!!data.session);
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function onSubmit() {
    setMsg(null);
    if (password !== password2) {
      setMsg("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      setMsg(errLabel("WEAK_PASSWORD"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) throw new Error("UPDATE_FAILED");
      setMsg("密码已更新，正在进入首页…");
      nav("/", { replace: true });
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "UPDATE_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  if (!import.meta.env.VITE_SUPABASE_URL?.trim() || !import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) {
    return (
      <div className="page settings-page login-page">
        <header className="page-header">
          <Link to="/login" className="back-link">
            ← 返回登录
          </Link>
          <h1>重置密码</h1>
        </header>
        <section className="settings-section">
          <p className="login-msg">未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。</p>
        </section>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="page settings-page login-page">
        <header className="page-header">
          <Link to="/login" className="back-link">
            ← 返回登录
          </Link>
          <h1>重置密码</h1>
        </header>
        <section className="settings-section">
          <p className="login-msg">
            {msg ?? "正在验证邮件链接… 若长时间无响应，请从邮箱里的重置链接重新打开本页。"}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page settings-page login-page">
      <header className="page-header">
        <Link to="/login" className="back-link">
          ← 返回登录
        </Link>
        <h1>设置新密码</h1>
      </header>

      <section className="settings-section">
        <label className="row">
          <span>新密码</span>
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </label>
        <label className="row">
          <span>确认密码</span>
          <input
            type="password"
            name="newPassword2"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="再次输入"
          />
        </label>
        <div className="row gap login-actions">
          <button type="button" className="btn primary" onClick={() => void onSubmit()} disabled={busy}>
            {busy ? "提交中…" : "确认重置"}
          </button>
        </div>
        {msg ? <p className="login-msg">{msg}</p> : null}
      </section>
    </div>
  );
}
