import { Link } from "react-router-dom";

export function LogicPage() {
  return (
    <div className="page hub-placeholder-page">
      <header className="page-header">
        <h1>推演</h1>
        <Link to="/library" className="btn ghost small">
          作品库
        </Link>
      </header>
      <p className="muted">逻辑与情节推演能力将在这里接入，敬请期待。</p>
    </div>
  );
}
