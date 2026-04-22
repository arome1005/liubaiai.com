import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { DEV_LOCAL_ORIGIN } from "./dev/dev-local-origin";
import { DEV_LIBRARY_URL } from "./dev/dev-local-origin";
import { getWritingStore } from "./storage/instance";

const root = document.getElementById("root");

async function boot() {
  if (!root) return;

  if (import.meta.env.DEV) {
    try {
      if (window.location.origin !== DEV_LOCAL_ORIGIN) {
        root.innerHTML = `<div style="padding:2rem;max-width:36rem;font-family:system-ui,sans-serif;line-height:1.6">
          <p style="font-weight:600;margin:0 0 0.75rem">本地开发地址已限制</p>
          <p style="margin:0 0 0.5rem;color:#666">请仅使用：<strong>${DEV_LIBRARY_URL}</strong></p>
          <p style="margin:0;color:#666">当前：<code style="word-break:break-all">${window.location.href}</code></p>
          <p style="margin:0.75rem 0 0;color:#666">关闭其它端口的 dev/preview，在项目根执行 <code>npm run dev</code>（固定 5173）。</p>
        </div>`;
        return;
      }
    } catch {
      /* ignore */
    }
  }

  const reactRoot = createRoot(root);
  reactRoot.render(
    <div className="page">
      <h1>留白写作</h1>
      <p className="muted">初始化中…（IndexedDB）</p>
      <p className="muted small">若长时间停留在此，请打开开发者工具的 Network/Console 查看是否有 IndexedDB 或脚本加载异常。</p>
    </div>,
  );
  const warnTimer = window.setTimeout(() => {
    try {
      reactRoot.render(
        <div className="page">
          <h1>留白写作</h1>
          <p className="muted">初始化中…（可能被浏览器阻止 IndexedDB 或迁移卡住）</p>
          <p className="muted small">
            你可以尝试：换一个端口（重启 dev server）、关闭无痕模式、或在 Chrome 的站点设置里允许存储。
          </p>
        </div>,
      );
    } catch {
      /* ignore */
    }
  }, 2500);
  try {
    await getWritingStore().init();
    window.clearTimeout(warnTimer);
    if (import.meta.env.DEV) {
      console.info(
        "[留白写作 dev] 已加载最新壳层：顶栏无「更多」；新建作品弹窗应含作品简介/状态/chip（DOM: [data-shell=liubai-v2] / [data-work-form=v2]）",
      );
    }
    if (import.meta.env.VITE_E2E === "1") {
      const { registerPlaywrightE2eHooks } = await import("./e2e/playwright-hooks");
      registerPlaywrightE2eHooks();
    }
    reactRoot.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch (e) {
    window.clearTimeout(warnTimer);
    const msg = e instanceof Error ? e.message : String(e);
    reactRoot.render(
      <div className="page">
        <h1>启动失败</h1>
        <p className="muted">
          应用初始化存储时出错（IndexedDB / 迁移）。请先导出备份（若还能打开旧端口），或尝试清空站点数据后重试。
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--surface)",
          }}
        >
          {msg}
        </pre>
      </div>,
    );
  }
}

void boot();
