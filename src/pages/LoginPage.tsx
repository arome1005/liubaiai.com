import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  authLogin,
  authLogout,
  authMe,
  authRegisterComplete,
  authRequestRegisterCode,
  type AuthUser,
} from "../api/auth";

function errLabel(code: string): string {
  const map: Record<string, string> = {
    BAD_EMAIL: "邮箱格式不正确",
    WEAK_PASSWORD: "密码至少 8 位",
    EMAIL_TAKEN: "该邮箱已注册，请使用上方「登录」。若忘记密码可走重置密码。",
    BAD_INPUT: "请填写邮箱和密码",
    INVALID_CREDENTIALS: "邮箱或密码错误",
    REGISTER_FAILED: "注册失败",
    LOGIN_FAILED: "登录失败",
    ME_FAILED: "无法获取登录状态",
    REQUEST_CODE_FAILED: "发送验证码失败",
    RATE_LIMIT: "发送次数过多，请稍后再试",
    TOO_SOON: "发送太频繁，请约 1 分钟后再试",
    MAIL_FAILED: "邮件发送失败，请检查服务器发信配置",
    BAD_CODE: "验证码不正确",
    OTP_EXPIRED: "验证码已过期，请重新获取",
    USE_OTP_FLOW: "请使用「发送验证码」与「完成注册」完成注册",
    SUPABASE_NOT_CONFIGURED: "未配置 Supabase（VITE_SUPABASE_URL / ANON_KEY）",
  };
  return map[code] ?? code;
}

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user: u } = await authMe();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSendCode() {
    setMsg(null);
    setCodeBusy(true);
    try {
      const res = await authRequestRegisterCode(email.trim());
      if (res.dev?.code) {
        setMsg(`开发模式：验证码为 ${res.dev.code}（也可查看后端控制台）`);
      } else {
        setMsg("验证码已发送，请查收邮件（垃圾箱也看一下）。");
      }
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "REQUEST_CODE_FAILED"));
    } finally {
      setCodeBusy(false);
    }
  }

  async function onRegisterComplete() {
    setMsg(null);
    setBusy(true);
    try {
      await authRegisterComplete(email.trim(), password, code.trim());
      const { user: u } = await authMe();
      setUser(u);
      setMsg("注册成功，已登录。");
      nav("/", { replace: true });
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "REGISTER_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function onLogin() {
    setMsg(null);
    setBusy(true);
    try {
      await authLogin(email.trim(), password);
      const { user: u } = await authMe();
      setUser(u);
      setMsg("登录成功。");
      nav("/", { replace: true });
    } catch (e) {
      setMsg(errLabel(e instanceof Error ? e.message : "LOGIN_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setMsg(null);
    setBusy(true);
    try {
      await authLogout();
      setUser(null);
      setMsg("已退出。");
    } catch {
      setMsg("退出失败");
    } finally {
      setBusy(false);
    }
  }

  const loggedIn = user !== undefined && user !== null;

  return (
    <div className="page settings-page login-page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← 首页
        </Link>
        <h1>账号</h1>
      </header>

      <section className="settings-section">
        <h2>当前状态</h2>
        {user === undefined ? (
          <p className="muted small">检查登录状态中…</p>
        ) : user ? (
          <p className="login-session">
            已登录：<strong>{user.email}</strong>
            <button type="button" className="btn" onClick={() => void onLogout()} disabled={busy}>
              退出
            </button>
          </p>
        ) : (
          <p className="muted small">
            未登录。注册需先收取邮箱验证码；登录使用邮箱与密码（账号由 Supabase Auth 管理）。
          </p>
        )}
      </section>

      {!loggedIn ? (
        <>
          <section className="settings-section">
            <h2>邮箱与密码</h2>
            <label className="row">
              <span>邮箱</span>
              <input
                type="text"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email"
              />
            </label>
            <label className="row">
              <span>密码</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
              />
            </label>
            <div className="row gap login-actions">
              <button type="button" className="btn primary" onClick={() => void onLogin()} disabled={busy}>
                登录
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              <Link to="/forgot-password">忘记密码？</Link>（由 Supabase 发送重置邮件）
            </p>
          </section>

          <section className="settings-section">
            <h2>新用户注册</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              使用上方同一邮箱与密码，先点「发送验证码」，邮件中的 6 位数字填在下方，再点「完成注册」。
            </p>
            <label className="row">
              <span>验证码</span>
              <input
                type="text"
                inputMode="numeric"
                name="otp"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位数字"
                maxLength={6}
              />
            </label>
            <div className="row gap login-actions">
              <button type="button" className="btn" onClick={() => void onSendCode()} disabled={busy || codeBusy}>
                {codeBusy ? "发送中…" : "发送验证码"}
              </button>
              <button type="button" className="btn primary" onClick={() => void onRegisterComplete()} disabled={busy}>
                完成注册
              </button>
            </div>
          </section>
        </>
      ) : null}

      {msg ? <p className="login-msg">{msg}</p> : null}
    </div>
  );
}
