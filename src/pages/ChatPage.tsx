import { Link } from "react-router-dom";

export function ChatPage() {
  return (
    <div className="page hub-placeholder-page">
      <header className="page-header">
        <h1>问策</h1>
        <Link to="/library" className="btn ghost small">
          作品库
        </Link>
      </header>
      <p className="muted">独立对话与策略问答将在这里展开；写作时也可在右侧栏使用 AI。</p>
    </div>
  );
}
