import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← 返回
        </Link>
        <h1>用户协议</h1>
      </header>

      <section style={{ maxWidth: 860, lineHeight: 1.8 }}>
        <p className="muted small">最后更新：2026-03-31</p>

        <h2 style={{ marginTop: "1.25rem" }}>1. 软件定位</h2>
        <p>「留白写作」是一款本地优先的长篇写作工具。你对自己创作内容拥有完整权利与责任。</p>

        <h2 style={{ marginTop: "1.25rem" }}>2. 数据与备份</h2>
        <p>
          本应用默认把数据保存在本机浏览器存储中。你需要自行做好备份（设置页提供导出/导入备份）。因清理浏览器数据、设备故障等导致的丢稿风险需由你自行承担。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>3. AI 功能</h2>
        <p>
          AI 生成内容仅供参考。你在使用云端 AI 提供方时，应确保拥有上传相关内容的权利，并自行判断生成内容的准确性与合规性。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>4. 免责声明</h2>
        <p className="muted small">
          在法律允许范围内，本应用对因使用或无法使用本应用而产生的任何间接损失不承担责任，包括但不限于数据丢失、内容不准确、第三方服务不可用等。
        </p>
      </section>
    </div>
  );
}

