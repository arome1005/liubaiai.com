import { Link } from "react-router-dom";
import type { AuthUser } from "../api/auth";

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
  onOpenCreatorCenter: () => void;
};

export function UserAccountMenu({ authUser, onOpenCreatorCenter }: Props) {
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
    <div className="user-account-menu">
      <button
        type="button"
        className="user-account-trigger"
        title={email}
        aria-label="创作中心"
        onClick={onOpenCreatorCenter}
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
    </div>
  );
}
