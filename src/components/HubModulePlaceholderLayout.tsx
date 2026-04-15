import { Link } from "react-router-dom";
import { HubAiSettingsHint } from "./HubAiSettingsHint";

type Props = {
  title: string;
  /** 与首页 Hub / 顶栏模块序号一致（1～7） */
  moduleHint: string;
  lead: string;
};

/** Hub 独立模块占位：与 v2 推演等模块同级的信息架构，功能迭代中 */
export function HubModulePlaceholderLayout({ title, moduleHint, lead }: Props) {
  return (
    <div className="page hub-module-placeholder-page">
      <header className="page-header hub-module-placeholder-header">
        <div className="hub-module-placeholder-header-text">
          <Link to="/" className="back-link hub-module-placeholder-back">
            ← 返回首页
          </Link>
          <div className="hub-module-placeholder-title-row">
            <span className="hub-module-placeholder-kbd" aria-hidden>
              {moduleHint}
            </span>
            <h1>{title}</h1>
          </div>
          <p className="muted small hub-module-placeholder-lead">{lead}</p>
        </div>
        <div className="header-actions">
          <Link to="/library" className="btn ghost small">
            作品库
          </Link>
        </div>
      </header>

      <section className="hub-module-placeholder-shell" aria-labelledby="hub-module-placeholder-status">
        <p id="hub-module-placeholder-status" className="hub-module-placeholder-status">
          模块界面预览占位
        </p>
        <div className="hub-module-placeholder-preview" aria-hidden="true">
          <div className="hub-module-placeholder-preview-head" />
          <div className="hub-module-placeholder-preview-body">
            <div className="hub-module-placeholder-preview-line hub-module-placeholder-preview-line--long" />
            <div className="hub-module-placeholder-preview-line hub-module-placeholder-preview-line--med" />
            <div className="hub-module-placeholder-preview-line hub-module-placeholder-preview-line--short" />
          </div>
        </div>
      </section>

      <footer className="hub-module-placeholder-footer">
        <HubAiSettingsHint />
      </footer>
    </div>
  );
}
