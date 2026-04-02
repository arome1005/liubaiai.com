import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  authLogin,
  authLogout,
  authMe,
  authRegisterComplete,
  authRequestRegisterCode,
  type AuthUser,
} from "../api/auth";

function googleErrLabel(code: string): string {
  const map: Record<string, string> = {
    google_not_configured: "未配置 Google 登录（需在环境变量中设置 GOOGLE_CLIENT_ID 等）",
    google_denied: "已取消 Google 授权",
    google_state: "安全校验失败，请重试",
    google_no_code: "授权未完成，请重试",
    google_no_email: "Google 未返回邮箱，无法登录",
    google_server: "Google 登录失败，请稍后重试",
  };
  return map[code] ?? code;
}

function errLabel(code: string): string {
  const map: Record<string, string> = {
    BAD_EMAIL: "邮箱格式不正确",
    WEAK_PASSWORD: "密码至少 8 位",
    EMAIL_TAKEN: "该邮箱已注册",
    BAD_INPUT: "请填写邮箱和密码",
    INVALID_CREDENTIALS: "邮箱或密码错误",
    OAUTH_ONLY: "该邮箱仅支持 Google 登录，请使用下方 Google 按钮",
    EMAIL_NOT_VERIFIED: "请先完成邮箱验证（旧账号请联系管理员）",
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
  };
  return map[code] ?? code;
}

export function LoginPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

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

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const err = searchParams.get("error");
    if (!oauth && !err) return;
    if (oauth === "success") {
      setMsg("Google 登录成功。");
      void authMe().then(({ user: u }) => setUser(u));
    } else if (err) {
      setMsg(googleErrLabel(err));
    }
    window.history.replaceState({}, "", "/login");
  }, [searchParams]);

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

  async function onGoogleLogin() {
    setMsg(null);
    setGoogleBusy(true);
    try {
      const res = await fetch("/api/auth/google/start-url", { credentials: "include" });
      let data: { url?: string; error?: string };
      try {
        data = (await res.json()) as { url?: string; error?: string };
      } catch {
        setMsg("登录服务返回异常（请确认 /api 已反代到后端，而非静态页的 index.html）。");
        return;
      }
      if (!res.ok || data.error) {
        setMsg(googleErrLabel(data.error ?? "google_server"));
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setMsg(googleErrLabel("google_server"));
    } catch {
      setMsg("无法连接登录服务，请检查网络或后端是否运行。");
    } finally {
      setGoogleBusy(false);
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
          <p className="muted small">未登录。注册需先收取邮箱验证码；登录仅需邮箱与密码。</p>
        )}
      </section>

      {!loggedIn ? (
        <>
          <section className="settings-section">
            <h2>邮箱与密码</h2>
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
            <label className="row">
              <span>密码</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
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
              <Link to="/forgot-password">忘记密码？</Link>
            </p>
          </section>

          <section className="settings-section">
            <h2>Google 登录</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              若该邮箱已用密码注册，首次使用 Google 将自动绑定同一账号。
            </p>
            <button
              type="button"
              className="btn login-google-btn"
              onClick={() => void onGoogleLogin()}
              disabled={busy || googleBusy}
            >
              {googleBusy ? "正在跳转…" : "使用 Google 继续"}
            </button>
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
