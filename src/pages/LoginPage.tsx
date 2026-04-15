import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  authForgotPassword,
  authLogin,
  authLogout,
  authMe,
  authRegisterComplete,
  authRequestRegisterCode,
  type AuthUser,
} from "../api/auth";
import { LoginHero } from "../components/LoginHero";

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
    FORGOT_FAILED: "发送失败",
  };
  return map[code] ?? code;
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {open ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

const TOAST_MS = 4200;

export function LoginPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordVisible, setRegPasswordVisible] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const [rememberMe, setRememberMe] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem("liubai-remember-login") !== "0" : true,
  );
  const [codeCooldownSec, setCodeCooldownSec] = useState(0);

  const emailRef = useRef(email);
  emailRef.current = email;

  useEffect(() => {
    localStorage.setItem("liubai-remember-login", rememberMe ? "1" : "0");
  }, [rememberMe]);

  useEffect(() => {
    if (codeCooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCodeCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [codeCooldownSec]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

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
    if (searchParams.get("forgot") !== "1") return;
    setForgotEmail(emailRef.current);
    setForgotModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("forgot");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (registerModalOpen) setRegisterModalOpen(false);
      if (forgotModalOpen) setForgotModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registerModalOpen, forgotModalOpen]);

  function openRegisterModal() {
    setRegEmail(email);
    setRegPassword(password);
    setCode("");
    setRegisterModalOpen(true);
  }

  function openForgotModal() {
    setForgotEmail(email);
    setForgotModalOpen(true);
  }

  async function onSendCode() {
    setToast(null);
    setCodeBusy(true);
    try {
      const res = await authRequestRegisterCode(regEmail.trim());
      if (res.dev?.code) {
        showToast(`开发模式：验证码为 ${res.dev.code}（也可查看后端控制台）`);
      } else {
        showToast("验证码已发送，请查收邮件（垃圾箱也看一下）。");
      }
      setCodeCooldownSec(60);
    } catch (e) {
      showToast(errLabel(e instanceof Error ? e.message : "REQUEST_CODE_FAILED"));
    } finally {
      setCodeBusy(false);
    }
  }

  async function onRegisterComplete() {
    setToast(null);
    setBusy(true);
    try {
      await authRegisterComplete(regEmail.trim(), regPassword, code.trim(), rememberMe);
      setEmail(regEmail.trim());
      setPassword(regPassword);
      const { user: u } = await authMe();
      setUser(u);
      showToast("注册成功，已登录。");
      setRegisterModalOpen(false);
      nav("/library", { replace: true });
    } catch (e) {
      showToast(errLabel(e instanceof Error ? e.message : "REGISTER_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function onLogin() {
    setToast(null);
    setBusy(true);
    try {
      await authLogin(email.trim(), password, rememberMe);
      const { user: u } = await authMe();
      setUser(u);
      showToast("登录成功。");
      nav("/library", { replace: true });
    } catch (e) {
      const label = errLabel(e instanceof Error ? e.message : "LOGIN_FAILED");
      showToast(label);
    } finally {
      setBusy(false);
    }
  }

  async function onForgotSubmit() {
    setToast(null);
    setForgotBusy(true);
    try {
      await authForgotPassword(forgotEmail.trim());
      showToast("若该邮箱已注册，你将收到一封重置密码邮件（由 Supabase 发送，请查看垃圾箱）。");
      setForgotModalOpen(false);
    } catch (e) {
      showToast(errLabel(e instanceof Error ? e.message : "FORGOT_FAILED"));
    } finally {
      setForgotBusy(false);
    }
  }

  async function onLogout() {
    setToast(null);
    setBusy(true);
    try {
      await authLogout();
      setUser(null);
      showToast("已退出。");
    } catch {
      showToast("退出失败");
    } finally {
      setBusy(false);
    }
  }

  const loggedIn = user !== undefined && user !== null;

  if (user === undefined) {
    return (
      <div className="login-hero-page login-v2" style={{ alignItems: "center", justifyContent: "center" }}>
        <p className="login-v2-muted">检查登录状态中…</p>
      </div>
    );
  }

  if (loggedIn) {
    return (
      <div className="login-hero-page login-v2" style={{ alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div className="login-hero-page__right-inner" style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 1rem" }}>
            已登录：<strong>{user.email}</strong>
          </p>
          <button type="button" className="login-v2-btn login-v2-btn--primary" style={{ maxWidth: 200 }} onClick={() => void onLogout()} disabled={busy}>
            退出
          </button>
          <p className="login-v2-muted" style={{ marginTop: "1rem" }}>
            <Link to="/">返回首页</Link>
          </p>
        </div>
        {toast ? (
          <div className="login-v2-toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    );
  }

  const isEmailFocus = emailFocus || email.length > 0;

  return (
    <div className="login-hero-page login-v2">
      {toast ? (
        <div className="login-v2-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="login-hero-page__left">
        <LoginHero isEmailFocus={isEmailFocus} isPasswordVisible={passwordVisible} />
      </div>

      <div className="login-hero-page__right">
        <div className="login-hero-page__right-inner">
          <h1 className="login-v2-title">欢迎回来</h1>

          <div className="login-v2-field">
            <label htmlFor="login-email">邮箱</label>
            <input
              id="login-email"
              className="login-v2-input"
              type="text"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              placeholder="you@example.com"
            />
          </div>

          <div className="login-v2-field">
            <label htmlFor="login-password">密码</label>
            <div className="login-v2-input-wrap">
              <input
                id="login-password"
                className="login-v2-input"
                type={passwordVisible ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
              />
              <button
                type="button"
                className="login-v2-pw-toggle"
                aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                onClick={() => setPasswordVisible((v) => !v)}
              >
                <EyeIcon open={passwordVisible} />
              </button>
            </div>
          </div>

          <div className="login-v2-row-between">
            <label className="login-v2-check">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              30 天内保持登录
            </label>
            <button type="button" className="login-v2-link-btn" onClick={openForgotModal}>
              忘记密码？
            </button>
          </div>

          <button type="button" className="login-v2-btn login-v2-btn--primary login-v2-btn--emph" onClick={() => void onLogin()} disabled={busy}>
            登录
          </button>

          {/* 其它登录方式：后续接入 Google / 手机验证码 / 微信 时只在本容器内增改 */}
          <div className="login-v2-alt-logins" aria-label="更多登录方式">
            <button type="button" className="login-v2-btn login-v2-btn--primary" disabled title="即将支持 Google 登录">
              使用 Google 登录（即将开放）
            </button>
            <button type="button" className="login-v2-btn login-v2-btn--primary" disabled title="即将支持手机验证码登录">
              手机验证码登录（即将开放）
            </button>
            <button type="button" className="login-v2-btn login-v2-btn--primary" disabled title="即将支持微信登录">
              微信登录（即将开放）
            </button>
          </div>

          <p className="login-v2-footer">
            还没有账号？{" "}
            <button type="button" className="login-v2-footer-link" onClick={openRegisterModal}>
              注册
            </button>
          </p>
        </div>
      </div>

      {registerModalOpen ? (
        <div
          className="login-v2-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRegisterModalOpen(false);
          }}
        >
          <div className="login-v2-modal login-v2-modal--wide" role="dialog" aria-labelledby="login-reg-title" aria-modal="true">
            <div className="login-v2-modal-head">
              <h2 id="login-reg-title">新用户注册</h2>
              <button type="button" className="login-v2-modal-close" aria-label="关闭" onClick={() => setRegisterModalOpen(false)}>
                ×
              </button>
            </div>
            <p className="login-v2-modal-desc">填写注册邮箱与登录密码，发送验证码后，将邮件中的 6 位数字填入并完成注册。</p>

            <div className="login-v2-field">
              <label htmlFor="reg-email">邮箱</label>
              <input
                id="reg-email"
                className="login-v2-input"
                type="text"
                name="reg-email"
                autoComplete="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="login-v2-field">
              <label htmlFor="reg-password">设置密码</label>
              <div className="login-v2-input-wrap">
                <input
                  id="reg-password"
                  className="login-v2-input"
                  type={regPasswordVisible ? "text" : "password"}
                  name="new-password"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="至少 8 位"
                />
                <button
                  type="button"
                  className="login-v2-pw-toggle"
                  aria-label={regPasswordVisible ? "隐藏密码" : "显示密码"}
                  onClick={() => setRegPasswordVisible((v) => !v)}
                >
                  <EyeIcon open={regPasswordVisible} />
                </button>
              </div>
            </div>

            <div className="login-v2-field">
              <label htmlFor="login-otp">验证码</label>
              <input
                id="login-otp"
                className="login-v2-input"
                type="text"
                inputMode="numeric"
                name="otp"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位数字"
                maxLength={6}
              />
            </div>
            <div className="login-v2-modal-actions">
              <button
                type="button"
                className="login-v2-btn login-v2-btn--primary"
                onClick={() => void onSendCode()}
                disabled={busy || codeBusy || codeCooldownSec > 0}
              >
                {codeBusy ? "发送中…" : codeCooldownSec > 0 ? `${codeCooldownSec} 秒后可重发` : "发送验证码"}
              </button>
              <button type="button" className="login-v2-btn login-v2-btn--primary login-v2-btn--emph" onClick={() => void onRegisterComplete()} disabled={busy}>
                完成注册
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {forgotModalOpen ? (
        <div
          className="login-v2-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setForgotModalOpen(false);
          }}
        >
          <div className="login-v2-modal" role="dialog" aria-labelledby="login-forgot-title" aria-modal="true">
            <div className="login-v2-modal-head">
              <h2 id="login-forgot-title">忘记密码</h2>
              <button type="button" className="login-v2-modal-close" aria-label="关闭" onClick={() => setForgotModalOpen(false)}>
                ×
              </button>
            </div>
            <p className="login-v2-modal-desc">
              填写注册邮箱，Supabase 将发送重置链接（有效期见控制台与邮件说明；Redirect 需包含本站的 /reset-password）。
            </p>
            <div className="login-v2-field">
              <label htmlFor="forgot-email">邮箱</label>
              <input
                id="forgot-email"
                className="login-v2-input"
                type="text"
                name="email"
                autoComplete="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="login-v2-modal-actions">
              <button type="button" className="login-v2-btn login-v2-btn--primary login-v2-btn--emph" onClick={() => void onForgotSubmit()} disabled={forgotBusy}>
                {forgotBusy ? "发送中…" : "发送重置邮件"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
