import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authResetPassword } from "../api/auth";

function errLabel(code: string): string {
  const map: Record<string, string> = {
    WEAK_PASSWORD: "密码至少 8 位",
    BAD_TOKEN: "链接无效或已使用",
    TOKEN_EXPIRED: "链接已过期，请重新申请重置",
    RESET_FAILED: "重置失败",
    SERVER_ERROR: "服务器错误",
  };
  return map[code] ?? code;
}

export function ResetPasswordPage() {
  const [search] = useSearchParams();
  const nav = useNavigate();
  const token = useMemo(() => search.get("token")?.trim() ?? "", [search]);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setMsg(null);
    if (password !== password2) {
      setMsg("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      await authResetPassword(token, password);
      setMsg("密码已更新，正在进入首页…");
      nav("/", { replace: true });
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "RESET_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="page settings-page login-page">
        <header className="page-header">
          <Link to="/login" className="back-link">
            ← 返回登录
          </Link>
          <h1>重置密码</h1>
        </header>
        <section className="settings-section">
          <p className="login-msg">链接无效或已过期，请从「忘记密码」重新获取邮件。</p>
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
