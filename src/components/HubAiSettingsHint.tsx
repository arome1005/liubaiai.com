import { Link } from "react-router-dom";

/** Hub 各模块页底部：引导配置模型；推演 / 流光 / 问策等含 AI 的页面共用 */
export function HubAiSettingsHint() {
  return (
    <p className="muted small mt-3 max-w-prose leading-relaxed">
      云端模型与 API Key 请在 <Link to="/settings">设置</Link>
      中配置。写作页可用右侧栏 AI；推演、流光、问策等页的 AI 能力亦依赖同一配置。
    </p>
  );
}
