/**
 * 生产若静态站未反代 /api，构建时必须设置 VITE_API_BASE（Vite 在 build 时内联进 JS）。
 * 仅在 Vercel 面板加变量而不重新触发 Production Build，线上仍会走同源 /api → 405。
 */
const RAW = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? "";
const BASE = RAW.replace(/\/$/, "");

if (typeof window !== "undefined" && import.meta.env.PROD && !BASE) {
  console.warn(
    "[留白写作] VITE_API_BASE 在构建时为空：请求仍发往当前站点 /api。若在托管平台已配置该变量，请对 Production 重新 Deploy（重新执行 npm run build）。",
  );
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return BASE ? `${BASE}${p}` : p;
}
