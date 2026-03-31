import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { getWritingStore } from "./storage/instance";

const root = document.getElementById("root");

async function boot() {
  if (!root) return;
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
