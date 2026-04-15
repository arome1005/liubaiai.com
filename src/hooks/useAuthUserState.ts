import { useCallback, useEffect, useState } from "react";
import { authMe, type AuthUser } from "../api/auth";
import { getSupabase } from "../lib/supabase";

/** 当前 Supabase 会话用户；订阅 auth 变化以便头像等元数据更新后刷新 */
export function useAuthUserState(pathname?: string) {
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);

  const refresh = useCallback(() => {
    void authMe().then((r) => setAuthUser(r.user));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user } = await authMe();
        if (!cancelled) setAuthUser(user);
      } catch {
        if (!cancelled) setAuthUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange(() => {
      void authMe().then((r) => setAuthUser(r.user));
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return { authUser, refreshAuth: refresh };
}
