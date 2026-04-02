/** 生产若静态站未反代 /api，可设 VITE_API_BASE=https://api.你的域名（无末尾 /） */
const RAW = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? "";
const BASE = RAW.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return BASE ? `${BASE}${p}` : p;
}
