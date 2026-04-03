import { Navigate } from "react-router-dom";

/** 忘记密码已并入登录页弹窗；保留路由以兼容旧链接与书签 */
export function ForgotPasswordPage() {
  return <Navigate to="/login?forgot=1" replace />;
}
