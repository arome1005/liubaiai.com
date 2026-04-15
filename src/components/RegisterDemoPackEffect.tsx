import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { seedRegisterDemoPackIfEligible } from "../seed/register-demo-pack";

/** 已登录且本地作品库为空时注入一次演示包（IndexedDB + localStorage 去重）。 */
export function RegisterDemoPackEffect() {
  const { pathname } = useLocation();
  const { authUser } = useAuthUserState(pathname);

  useEffect(() => {
    const id = authUser?.id;
    if (!id) return;
    void seedRegisterDemoPackIfEligible(id);
  }, [authUser?.id]);

  return null;
}
