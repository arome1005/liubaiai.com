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
        <p className="muted small">最后更新：2026-04-26</p>

        <h2 style={{ marginTop: "1.25rem" }}>1. 软件定位</h2>
        <p>「留白写作」是一款本地优先的长篇写作工具。你对自己创作内容拥有完整权利与责任。</p>

        <h2 style={{ marginTop: "1.25rem" }}>2. 数据与备份</h2>
        <p>
          本应用默认把数据保存在本机浏览器存储中。你需要自行做好备份（设置页提供导出/导入备份）。因清理浏览器数据、设备故障等导致的丢稿风险需由你自行承担。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>3. AI 功能</h2>
        <p>
          写作侧栏、推演、问策、流光、生辉等模块在调用 AI 时，均受你在「设置」中选择的提供方与<strong>隐私 / 上传范围</strong>约束；生成内容仅供参考。
          你在使用云端 AI 提供方时，应确保拥有上传相关内容的权利，并自行判断生成内容的准确性与合规性。
        </p>
        <p>
          <strong>虚构创作：</strong>AI 输出视为虚构创作辅助；你承诺不将其用于现实违法、侵害他人合法权益或误导公众等行为。
        </p>

        <h2 style={{ marginTop: "1.25rem" }}>4. 本地直连模式（高级，可选）</h2>
        <p>
          应用提供一项<strong>可选</strong>的「本地直连模式」（高级）：用户可在<strong>自己的电脑</strong>上启动一个本地 sidecar 进程，
          使用<strong>自己的 Claude 账号</strong>登录 Claude Code CLI，让 AI 调用通过本机回环直连该订阅，而不经过本应用提供的云端 API 通路。
          该功能默认<strong>关闭</strong>，仅在用户主动勾选同意以下条款并完成本机配置后生效。
        </p>
        <ul>
          <li>
            <strong>本地自配置：</strong>该模式所需的 sidecar 程序、Claude 订阅账号、OAuth 凭据、token 等
            <strong>全部由用户在本机自行配置与保管</strong>，不通过本应用的服务端中转或托管。
          </li>
          <li>
            <strong>平台不托管第三方账号或密钥：</strong>本应用<strong>不收集、不存储、不代管</strong>用户的 Claude 账号、OAuth 凭据、
            sidecar token，以及任何其它第三方服务密钥。所有凭据仅保存在用户本机浏览器的 localStorage / 本地配置文件中。
          </li>
          <li>
            <strong>条款与风控自担：</strong>该调用方式<strong>未必</strong>被 Claude 等第三方平台条款明确覆盖；
            因此可能产生的封号、限速、异常计费、违约或其它账号合规与风控后果，<strong>由用户本人自行承担</strong>，
            本应用不对此承担任何责任。
          </li>
          <li>
            <strong>仅本机使用、不得共享：</strong>用户应仅在自己的电脑上使用该功能，sidecar 仅监听本机回环地址（127.0.0.1）；
            不得对外暴露公网、不得在多人之间共享同一 token 或共用同一 Claude 账号。否则相关风险与责任完全由用户承担。
          </li>
          <li>
            <strong>合规自查：</strong>启用前，请用户自行阅读并遵守 Claude（Anthropic）等所选第三方服务的最新使用条款、
            订阅条款与政策；如条款变更导致该模式不再可用或带来风险，用户应及时停用。
          </li>
        </ul>

        <h2 style={{ marginTop: "1.25rem" }}>5. 免责声明</h2>
        <p className="muted small">
          在法律允许范围内，本应用对因使用或无法使用本应用而产生的任何间接损失不承担责任，包括但不限于数据丢失、内容不准确、第三方服务不可用等。
        </p>
      </section>
    </div>
  );
}

