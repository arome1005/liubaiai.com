import { Link } from "react-router-dom";

export function InspirationPage() {
  return (
    <div className="page hub-placeholder-page">
      <header className="page-header">
        <h1>流光</h1>
        <Link to="/library" className="btn ghost small">
          作品库
        </Link>
      </header>
      <p className="muted">灵感收集与闪念将在这里呈现，敬请期待。</p>
    </div>
  );
}
