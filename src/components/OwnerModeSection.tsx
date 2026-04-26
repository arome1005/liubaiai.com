/**
 * Owner 模式设置卡片：仅当当前登录账号是 owner 时渲染。
 * 在「设置 → AI」末尾出现，提供：
 *  - 总开关（Switch）：开启后调用走本机 sidecar
 *  - Sidecar Token 输入（Bearer 头校验）
 *  - Sidecar Base URL（默认 127.0.0.1:7788）
 *  - 模型选择（sonnet / opus / haiku）
 *  - 「测试连接」按钮：探测 /health 与发一次 1-token 请求验证 token
 *
 * 本组件**不持久化任何 token 到 Supabase / 后端**——一切 localStorage。
 */
import { useEffect, useMemo, useState } from "react";
import {
  isOwnerEmail,
  getOwnerModeEnabled,
  setOwnerModeEnabled,
  getOwnerSidecarToken,
  setOwnerSidecarToken,
  getOwnerSidecarBaseUrl,
  setOwnerSidecarBaseUrl,
  getOwnerModel,
  setOwnerModel,
  probeSidecar,
} from "../util/owner-mode";

type ConnState = "idle" | "checking" | "ok" | "fail";

export function OwnerModeSection({ currentEmail }: { currentEmail: string | null | undefined }) {
  const isOwner = useMemo(() => isOwnerEmail(currentEmail), [currentEmail]);

  const [enabled, setEnabled] = useState<boolean>(() => getOwnerModeEnabled());
  const [token, setToken] = useState<string>(() => getOwnerSidecarToken());
  const [baseUrl, setBaseUrl] = useState<string>(() => getOwnerSidecarBaseUrl());
  const [model, setModel] = useState<string>(() => getOwnerModel());
  const [showToken, setShowToken] = useState(false);
  const [conn, setConn] = useState<ConnState>("idle");
  const [connMsg, setConnMsg] = useState<string>("");

  useEffect(() => {
    if (!isOwner) return;
    if (!enabled) return;
    // 进入页面时静默探测一次，给徽章/状态一个新鲜值
    void probeSidecar(true).then((ok) => {
      setConn(ok ? "ok" : "fail");
      setConnMsg(ok ? "已连通" : "连不上 sidecar，先在终端 npm run sidecar");
    });
  }, [isOwner, enabled]);

  if (!isOwner) return null;

  const onToggle = (v: boolean) => {
    setEnabled(v);
    setOwnerModeEnabled(v);
  };
  const onTokenChange = (v: string) => {
    setToken(v);
    setOwnerSidecarToken(v);
    setConn("idle");
    setConnMsg("");
  };
  const onBaseUrlChange = (v: string) => {
    setBaseUrl(v);
    setOwnerSidecarBaseUrl(v);
    setConn("idle");
    setConnMsg("");
  };
  const onModelChange = (v: string) => {
    setModel(v);
    setOwnerModel(v);
  };

  const test = async () => {
    setConn("checking");
    setConnMsg("正在探测 /health …");
    const ok = await probeSidecar(true);
    if (!ok) {
      setConn("fail");
      setConnMsg("连不上 sidecar：请确认本机已 npm run sidecar，且 Base URL 没填错");
      return;
    }
    if (!token.trim()) {
      setConn("fail");
      setConnMsg("Sidecar 在线，但还没填 Token");
      return;
    }
    // 进一步：发一个最小请求验证 token
    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/v1/stream`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "回复一个汉字。" }],
          model: model || "sonnet",
        }),
      });
      if (r.status === 401) {
        setConn("fail");
        setConnMsg("Sidecar 拒绝该 Token；请在终端确认/重新复制");
        return;
      }
      if (!r.ok) {
        setConn("fail");
        setConnMsg(`Sidecar 返回 ${r.status}`);
        return;
      }
      // 不读完整 stream，只确认握手成功
      try {
        await r.body?.cancel();
      } catch {
        /* ignore */
      }
      setConn("ok");
      setConnMsg("连通 + Token 校验通过");
    } catch (e) {
      setConn("fail");
      setConnMsg(`请求失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const statusColor =
    conn === "ok" ? "var(--success, #10b981)" :
    conn === "fail" ? "var(--destructive, #f43f5e)" :
    conn === "checking" ? "var(--muted-foreground, #64748b)" :
    "var(--muted-foreground, #64748b)";

  return (
    <div
      className="settings-ai-usage"
      role="region"
      aria-label="Owner 模式 · Claude Code 本地直连"
      style={{ marginTop: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 className="settings-ai-usage-title">Owner 模式 · Claude Code 本地直连</h3>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="small">{enabled ? "已启用" : "未启用"}</span>
        </label>
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        启用后：本账号触发的 AI 调用会走本机 sidecar → Claude 订阅，不消耗 API 额度。
        sidecar 未启动或 Token 不对时，自动 fallback 到下方常规 provider。
        <strong style={{ marginLeft: 4 }}>仅本人可见。</strong>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, marginTop: 12, alignItems: "center" }}>
        <span className="small">Sidecar Token</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            type={showToken ? "text" : "password"}
            value={token}
            placeholder="在终端 npm run sidecar 后从控制台复制"
            onChange={(e) => onTokenChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn ghost" onClick={() => setShowToken((v) => !v)}>
            {showToken ? "隐藏" : "显示"}
          </button>
        </div>

        <span className="small">Base URL</span>
        <input
          className="input"
          type="text"
          value={baseUrl}
          placeholder="http://127.0.0.1:7788"
          onChange={(e) => onBaseUrlChange(e.target.value)}
          spellCheck={false}
        />

        <span className="small">默认模型</span>
        <select
          className="input"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        >
          <option value="sonnet">Sonnet（推荐）</option>
          <option value="opus">Opus（强但慢）</option>
          <option value="haiku">Haiku（快而省）</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button
          type="button"
          className="btn"
          disabled={!enabled || conn === "checking"}
          onClick={() => void test()}
        >
          {conn === "checking" ? "测试中…" : "测试连接"}
        </button>
        <span className="small" style={{ color: statusColor }}>
          {connMsg || (enabled ? "尚未测试" : "已禁用")}
        </span>
      </div>

      <p className="muted small" style={{ marginTop: 10, fontSize: "0.74rem", lineHeight: 1.6 }}>
        启动方式：在仓库根 <code>npm run sidecar</code>（首次需 <code>npm run sidecar:install</code>）。
        Token 持久化在 <code>~/.liubai-sidecar/config.json</code>，重启后不会变。
        <br />
        重要：请勿设置 <code>ANTHROPIC_API_KEY</code> 环境变量——会让 SDK 走 API 计费而不是订阅。
      </p>
    </div>
  );
}
