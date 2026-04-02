import { useState } from "react";
import { Link } from "react-router-dom";
import { authForgotPassword } from "../api/auth";

function errLabel(code: string): string {
  const map: Record<string, string> = {
    BAD_EMAIL: "邮箱格式不正确",
    RATE_LIMIT: "发送次数过多，请稍后再试",
    MAIL_FAILED: "邮件发送失败，请检查服务器发信配置",
    FORGOT_FAILED: "发送失败",
  };
  return map[code] ?? code;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await authForgotPassword(email.trim());
      if (res.dev?.resetUrl) {
        setMsg(`开发模式：重置链接 ${res.dev.resetUrl}`);
      } else {
        setMsg("若该邮箱已注册，你将收到一封重置密码邮件（请查看垃圾箱）。");
      }
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "FORGOT_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page settings-page login-page">
      <header className="page-header">
        <Link to="/login" className="back-link">
          ← 返回登录
        </Link>
        <h1>忘记密码</h1>
      </header>

      <section className="settings-section">
        <p className="muted small" style={{ marginTop: 0 }}>
          填写注册邮箱，我们将发送重置链接（链接在约 1 小时内有效）。
        </p>
        <label className="row">
          <span>邮箱</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <div className="row gap login-actions">
          <button type="button" className="btn primary" onClick={() => void onSubmit()} disabled={busy}>
            {busy ? "发送中…" : "发送重置邮件"}
          </button>
        </div>
        {msg ? <p className="login-msg">{msg}</p> : null}
      </section>
    </div>
  );
}
