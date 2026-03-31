import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← 返回
        </Link>
        <h1>隐私政策</h1>
      </header>

      <section style={{ maxWidth: 860, lineHeight: 1.8 }}>
        <p className="muted small">最后更新：2026-03-31</p>

        <h2 style={{ marginTop: "1.25rem" }}>1. 我们收集什么数据</h2>
        <p>
          「留白写作」当前为<strong>纯前端应用</strong>：作品、章节正文、圣经、概要、参考库等内容默认保存在你本机浏览器的
          <strong>IndexedDB</strong> 中；AI 设置与密钥保存在本机浏览器的<strong>localStorage</strong> 中。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>2. 数据是否会上线/上云</h2>
        <p>
          默认情况下，我们不会把你的正文内容上传到我们的服务器（目前也没有账号体系与云同步功能）。
          但当你使用<strong>云端 AI 提供方</strong>（如 OpenAI / Claude / Gemini）并点击「生成」时，本次提示词（由你选择注入的内容组成）
          会通过网络发送到对应第三方服务。
        </p>
        <p>
          你可以在「设置 → AI 隐私与上传范围」中明确选择是否允许使用云端提供方、以及允许上传哪些内容（正文/圣经/摘要/摘录/RAG 等）。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>3. 第三方服务</h2>
        <p>
          若你启用云端 AI，本次请求会受第三方服务的政策约束。我们建议你在启用前阅读对应提供方的隐私条款，并避免上传敏感信息。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>4. 你的控制权</h2>
        <ul>
          <li>你可以随时导出备份 zip，把数据带走。</li>
          <li>你可以关闭云端 AI，或仅使用本机 Ollama。</li>
          <li>你可以在浏览器中清除本站点数据以删除本地存储内容（注意：这会删除未备份的作品）。</li>
        </ul>

        <h2 style={{ marginTop: "1.25rem" }}>5. 联系方式</h2>
        <p className="muted small">如需反馈隐私问题，请通过项目页面或站点提供的联系方式联系维护者。</p>
      </section>
    </div>
  );
}

