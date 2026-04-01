import { Link } from "react-router-dom";

/** 顶栏「生辉」占位：后续装修独立模块，与写作编辑页解耦。 */
export function ShengHuiPage() {
  return (
    <div className="page hub-placeholder-page">
      <header className="page-header">
        <h1>生辉</h1>
        <Link to="/library" className="btn ghost small">
          作品库
        </Link>
      </header>
      <p className="muted">这里将承载生辉相关能力，与作品库内的写作编辑相互独立。</p>
    </div>
  );
}
