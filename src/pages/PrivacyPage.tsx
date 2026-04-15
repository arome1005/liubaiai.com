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
        <p className="muted small">最后更新：2026-04-02</p>

        <h2 style={{ marginTop: "1.25rem" }}>1. 我们收集什么数据</h2>
        <p>
          「留白写作」以<strong>浏览器端</strong>为主：作品、章节正文、本书锦囊、概要等内容默认保存在你本机浏览器的
          <strong>IndexedDB</strong> 中；<strong>参考库（藏经）正文与分块默认仅存本机</strong>。AI 设置与密钥保存在本机浏览器的
          <strong>localStorage</strong> 中。若你使用<strong>账号登录</strong>且应用开启了与 Supabase 等服务的同步（Hybrid），部分写作数据可能同步至你所登录账户对应的云端存储，具体以应用内说明与配置为准。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>2. 数据是否会上线/上云</h2>
        <p>
          在未启用云同步或未调用云端 AI 时，正文默认不经过我们的业务服务器存储。若你启用<strong>写作数据云同步</strong>，作品/章节/本书锦囊等可能加密同步至第三方托管（如 Supabase），仍建议定期使用应用内导出备份。
          当你使用<strong>云端 AI 提供方</strong>（如 OpenAI / Claude / Gemini 等）并点击「生成」时，本次提示词（由你选择注入的内容组成）
          会通过网络发送到对应第三方服务。
        </p>
        <p>
          你可以在「设置 → AI 隐私与上传范围」中明确选择是否允许使用云端提供方、以及允许上传哪些内容（正文/本书锦囊/摘要/摘录/RAG 检索片段等）。
          其中「RAG」包括对<strong>参考库（藏经）</strong>的命中片段，以及在侧栏开启时可选的<strong>本书锦囊导出分块</strong>与<strong>本书章节正文分块</strong>（均在本地检索；仅在启用云端 AI 且你允许上传对应范围时，相关片段会随请求发送至所选模型提供方）。
          虚构创作相关提示见「设置 → 虚构创作与 AI」。
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

