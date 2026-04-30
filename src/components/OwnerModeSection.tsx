/**
 * 高级接入（本地直连 · Claude Code 订阅直连）
 *
 * 以「高级接入」按钮 + Dialog 的形式嵌入「设置 → AI 配置」末尾。
 * 任何登录用户均可在自担风险下启用，前提是先勾选同意条款。
 *
 * 所有凭据仅保存在本机浏览器 localStorage 中，不上传后端。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Lock, Zap } from "lucide-react";
import {
  getLocalSidecarDisclaimerAccepted,
  setLocalSidecarDisclaimerAccepted,
  getLocalSidecarDisclaimerAcceptedAt,
  getOwnerModeEnabled,
  setOwnerModeEnabled,
  getOwnerSidecarToken,
  setOwnerSidecarToken,
  getOwnerSidecarBaseUrl,
  setOwnerSidecarBaseUrl,
  getOwnerModel,
  setOwnerModel,
  probeSidecar,
  readSidecarDailyTokens,
  calcSidecarEquivCostUsd,
} from "../util/owner-mode";
import { ADVANCED_UX_GATE_PIN } from "../util/backend-advanced-config-gate";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/utils";

type ConnState = "idle" | "checking" | "ok" | "fail";

export function OwnerModeSection({ currentEmail }: { currentEmail: string | null | undefined }) {
  const isLoggedIn = useMemo(() => !!(currentEmail && currentEmail.trim()), [currentEmail]);

  const [open, setOpen] = useState(false);
  const [usageSnap, setUsageSnap] = useState(() => readSidecarDailyTokens());
  const [pwOpen, setPwOpen] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const pwInputRef = useRef<HTMLInputElement>(null);

  const [accepted, setAccepted] = useState<boolean>(() => getLocalSidecarDisclaimerAccepted());
  const [acceptedAt, setAcceptedAt] = useState<string | null>(() => getLocalSidecarDisclaimerAcceptedAt());
  const [enabled, setEnabled] = useState<boolean>(() => getOwnerModeEnabled());
  const [token, setToken] = useState<string>(() => getOwnerSidecarToken());
  const [baseUrl, setBaseUrl] = useState<string>(() => getOwnerSidecarBaseUrl());
  const [model, setModel] = useState<string>(() => getOwnerModel());
  const [showToken, setShowToken] = useState(false);
  const [conn, setConn] = useState<ConnState>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [showDetails, setShowDetails] = useState<boolean>(() => getLocalSidecarDisclaimerAccepted());

  useEffect(() => {
    if (!accepted || !enabled) return;
    void probeSidecar(true).then((ok) => {
      setConn(ok ? "ok" : "fail");
      setConnMsg(ok ? "已连通" : "连不上 sidecar，先在终端 npm run sidecar");
    });
  }, [accepted, enabled]);

  if (!isLoggedIn) return null;

  const onAcceptDisclaimer = (v: boolean) => {
    setLocalSidecarDisclaimerAccepted(v);
    setAccepted(v);
    setAcceptedAt(getLocalSidecarDisclaimerAcceptedAt());
    if (!v) {
      setOwnerModeEnabled(false);
      setEnabled(false);
      setShowDetails(false);
      setConn("idle");
      setConnMsg("");
    } else {
      setShowDetails(true);
    }
  };

  const onToggle = (v: boolean) => {
    if (!accepted) return;
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
      try { await r.body?.cancel(); } catch { /* ignore */ }
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
    "var(--muted-foreground, #64748b)";

  return (
    <>
      {/* ── 触发按钮（内联于 AI 配置末尾） ── */}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors",
            "border-border/40 bg-background/30 hover:bg-background/60",
          )}
          onClick={() => {
            setPwInput("");
            setPwError(false);
            setPwOpen(true);
          }}
        >
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="font-medium">高级接入</span>
            <span className="text-xs text-muted-foreground">本地直连模式 · 听雨官方订阅直连</span>
          </span>
          <span className="flex items-center gap-2">
            {enabled && accepted && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                启用中
              </span>
            )}
            <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </span>
        </button>
      </div>

      {/* ── 密码验证弹窗 ── */}
      <Dialog open={pwOpen} onOpenChange={(v) => { setPwOpen(v); if (!v) { setPwInput(""); setPwError(false); } }}>
        <DialogContent
          className="max-w-xs"
          onOpenAutoFocus={() => setTimeout(() => pwInputRef.current?.focus(), 0)}
        >
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4 text-amber-400" />
            验证访问密码
          </DialogTitle>
          <p className="text-xs text-muted-foreground">高级接入为受保护功能，请输入访问密码继续。</p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pwInput.trim() === ADVANCED_UX_GATE_PIN) {
                setPwOpen(false);
                setPwInput("");
                setPwError(false);
                setUsageSnap(readSidecarDailyTokens());
                setOpen(true);
              } else {
                setPwError(true);
                setPwInput("");
                pwInputRef.current?.focus();
              }
            }}
          >
            <input
              ref={pwInputRef}
              type="password"
              className={cn(
                "input w-full",
                pwError && "border-destructive ring-1 ring-destructive/40",
              )}
              placeholder="请输入密码"
              value={pwInput}
              autoComplete="off"
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            />
            {pwError && (
              <p className="text-xs text-destructive">密码错误，请重试。</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn ghost text-sm" onClick={() => setPwOpen(false)}>取消</button>
              <button type="submit" className="btn text-sm" disabled={!pwInput.trim()}>确认</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 配置弹窗 ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 与创作中心弹窗同宽：覆盖 DialogContent 默认 sm:max-w-lg */}
        <DialogContent className="max-h-[min(90vh,840px)] w-full max-w-[min(72rem,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(72rem,calc(100vw-2rem))]">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Zap className="h-4 w-4 text-amber-400" />
            高级接入
          </DialogTitle>

          <p className="text-xs text-muted-foreground leading-relaxed">
            本地直连模式（高级）· 听雨官方订阅直连。
            高级用户可在<strong>自己的电脑</strong>上启动 sidecar，使用<strong>自己的 Claude 账号</strong>登录，
            让 AI 调用走 Claude 订阅而不是 API 计费。平台<strong>不托管</strong>任何第三方账号或密钥；
            所有凭据仅保存在本机浏览器 localStorage 中。
          </p>

          {/* 今日用量卡 */}
          {(() => {
            const { inputTokens, outputTokens, total, calls } = usageSnap;
            const costUsd = calcSidecarEquivCostUsd(inputTokens, outputTokens, model);
            return (
              <div className="rounded-lg border border-border/30 bg-background/20 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">今日用量（粗估）</span>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    onClick={() => setUsageSnap(readSidecarDailyTokens())}
                  >
                    刷新
                  </button>
                </div>
                {total === 0 ? (
                  <p className="text-xs text-muted-foreground/50">今日暂无调用记录。</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">输入</span>
                    <span className="tabular-nums text-right">{inputTokens.toLocaleString()} tokens</span>
                    <span className="text-muted-foreground">输出</span>
                    <span className="tabular-nums text-right">{outputTokens.toLocaleString()} tokens</span>
                    <span className="text-muted-foreground">合计</span>
                    <span className="tabular-nums text-right font-medium">{total.toLocaleString()} tokens</span>
                    <span className="text-muted-foreground">调用次数</span>
                    <span className="tabular-nums text-right">{calls} 次</span>
                    <span className="text-muted-foreground">等效 API 参考价</span>
                    <span className="tabular-nums text-right text-amber-400">
                      ≈ ${costUsd.toFixed(4)}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                  粗估值，非计费凭证。基于 Claude 公开定价换算（{model === "opus" ? "Opus $15/$75 /M" : model === "haiku" ? "Haiku $0.8/$4 /M" : "Sonnet $3/$15 /M"}，输入/输出）。
                </p>
              </div>
            );
          })()}

          {/* 总开关 */}
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-background/30 px-4 py-3">
            <span className="text-sm font-medium">启用本地直连</span>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={enabled}
                disabled={!accepted}
                onChange={(e) => onToggle(e.target.checked)}
              />
              <span className="text-xs text-muted-foreground">{enabled ? "已启用" : "未启用"}</span>
            </label>
          </div>

          {/* 协议同意门禁 */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed">
            <p className="mb-2 font-semibold text-amber-400">启用前请确认（自担风险）</p>
            <ol className="space-y-1 pl-4" style={{ listStyleType: "decimal" }}>
              <li>本功能为<strong>本地自配置</strong>：需在<strong>自己的电脑</strong>上启动 <code>npm run sidecar</code>，并已用<strong>你自己的 Claude 账号</strong>登录 Claude Code CLI。</li>
              <li>平台<strong>不托管</strong>你的 Claude 账号、token 或任何第三方密钥；token 仅保存在浏览器 localStorage。</li>
              <li>该方式<strong>未必</strong>被 Claude 平台条款明确覆盖；封号、限速、异常计费等风险<strong>由你本人自担</strong>。</li>
              <li>请<strong>仅本机使用</strong>：sidecar 只监听 <code>127.0.0.1</code>，不要暴露公网或与他人共享 token。</li>
            </ol>
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={accepted}
                onChange={(e) => onAcceptDisclaimer(e.target.checked)}
              />
              <span>
                我已阅读并同意 <Link to="/terms" onClick={() => setOpen(false)}>《用户协议》</Link> 与{" "}
                <Link to="/privacy" onClick={() => setOpen(false)}>《隐私政策》</Link> 中「本地直连模式（高级）」的相关说明，并自愿启用。
              </span>
            </label>
            {accepted && acceptedAt ? (
              <p className="mt-1.5 text-[10px] text-muted-foreground">已于 {acceptedAt} 同意。</p>
            ) : null}
          </div>

          {/* 同意后展开配置 */}
          {accepted && showDetails ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
                <span className="text-xs text-muted-foreground">Sidecar Token</span>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type={showToken ? "text" : "password"}
                    value={token}
                    placeholder="从终端 npm run sidecar 控制台复制"
                    onChange={(e) => onTokenChange(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" className="btn ghost text-xs" onClick={() => setShowToken((v) => !v)}>
                    {showToken ? "隐藏" : "显示"}
                  </button>
                </div>

                <span className="text-xs text-muted-foreground">Base URL</span>
                <input
                  className="input"
                  type="text"
                  value={baseUrl}
                  placeholder="http://127.0.0.1:7788"
                  onChange={(e) => onBaseUrlChange(e.target.value)}
                  spellCheck={false}
                />

                <span className="text-xs text-muted-foreground">默认模型</span>
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

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  className="btn"
                  disabled={!enabled || conn === "checking"}
                  onClick={() => void test()}
                >
                  {conn === "checking" ? "测试中…" : "测试连接"}
                </button>
                <span className="text-xs" style={{ color: statusColor }}>
                  {connMsg || (enabled ? "尚未测试" : "已禁用")}
                </span>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                启动方式：在仓库根 <code>npm run sidecar</code>（首次需 <code>npm run sidecar:install</code>）。
                Token 持久化在 <code>~/.liubai-sidecar/config.json</code>，重启后不会变。<br />
                重要：请勿设置 <code>ANTHROPIC_API_KEY</code> 环境变量——会让 SDK 走 API 计费而不是订阅。
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
