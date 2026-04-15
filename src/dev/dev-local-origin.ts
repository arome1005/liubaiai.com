/**
 * 本地开发唯一约定：Vite 固定 5173 + localhost 环回，避免多端口「假两套 UI」。
 * 生产构建不执行校验（import.meta.env.PROD）。
 */
export const DEV_LOCAL_ORIGIN = "http://localhost:5173" as const;

/** 作品库本地验收主入口（与 Vite server.port / strictPort 一致） */
export const DEV_LIBRARY_URL = `${DEV_LOCAL_ORIGIN}/library` as const;

