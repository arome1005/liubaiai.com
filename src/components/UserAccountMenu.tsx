import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authLogout, type AuthUser } from "../api/auth";
import { uploadUserAvatar } from "../api/avatar";

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "?";
  if (!local) return "?";
  const arr = [...local];
  return (arr[0] + (arr[1] ?? "")).toUpperCase();
}

function UserSilhouetteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

type Props = {
  authUser: AuthUser | null | undefined;
  onAuthUpdated: () => void;
};

export function UserAccountMenu({ authUser, onAuthUpdated }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onPickFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        await uploadUserAvatar(file);
        onAuthUpdated();
        setOpen(true);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [onAuthUpdated],
  );

  const onLogout = useCallback(async () => {
    setOpen(false);
    await authLogout();
    onAuthUpdated();
    navigate("/login");
  }, [navigate, onAuthUpdated]);

  if (authUser === undefined) {
    return (
      <div className="user-account-menu">
        <div className="user-account-trigger user-account-trigger--loading" aria-hidden>
          <span className="user-account-avatar user-account-avatar--placeholder">…</span>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="user-account-menu">
        <Link to="/login" className="user-account-trigger" title="登录" aria-label="登录">
          <span className="user-account-avatar user-account-avatar--placeholder user-account-avatar--guest">
            <UserSilhouetteIcon />
          </span>
        </Link>
      </div>
    );
  }

  const { email, avatarUrl } = authUser;
  const label = initialsFromEmail(email);

  return (
    <div className="user-account-menu" ref={wrapRef}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="visually-hidden"
        aria-hidden
        onChange={(ev) => void onFileChange(ev)}
      />
      <button
        type="button"
        className={"user-account-trigger" + (open ? " is-open" : "")}
        title={email}
        aria-label="账户菜单"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-account-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" width={32} height={32} decoding="async" />
          ) : (
            <span className="user-account-initials" aria-hidden>
              {label}
            </span>
          )}
        </span>
      </button>
      {open ? (
        <div className="user-account-dropdown" role="menu">
          <div className="user-account-dropdown-head">
            <div className="user-account-dropdown-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" width={48} height={48} decoding="async" /> : <span>{label}</span>}
            </div>
            <div className="user-account-dropdown-meta">
              <span className="user-account-dropdown-email">{email}</span>
              <span className="muted small">个人信息与资料将汇总于此（陆续开放）</span>
            </div>
          </div>
          <div className="user-account-dropdown-actions" role="none">
            <button
              type="button"
              className="user-account-dropdown-item"
              role="menuitem"
              disabled={uploading}
              onClick={() => {
                if (!uploading) onPickFile();
              }}
            >
              {uploading ? "上传中…" : "更换头像"}
            </button>
            <Link to="/settings" className="user-account-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              设置
            </Link>
            <button type="button" className="user-account-dropdown-item danger" role="menuitem" onClick={() => void onLogout()}>
              退出登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
