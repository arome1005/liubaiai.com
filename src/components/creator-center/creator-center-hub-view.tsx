"use client";

import { Link } from "react-router-dom";
import { BookOpen, Library, MessageSquare } from "lucide-react";
import { Button } from "../ui/button";

export type CreatorCenterHubViewProps = {
  creatorEmail: string | null;
  creatorAvatarUrl: string | null;
  creatorInitials: string;
  creatorSessionTokens: number;
  creatorTodayTokens: number;
  creatorLifetimeTokens: number;
  onRefreshUsage: () => void;
  /** 已登录：终身用量可与云端合并展示 */
  usageAccountLoggedIn?: boolean;
};

function formatTokenCell(value: number): string {
  return value >= 10_000 ? `${(value / 1_000).toFixed(0)}k` : value.toLocaleString();
}

/** 创作中心 · 主页：个人信息、本机 tokens 摘要、创作资产、个人提示词中心、快捷入口与权益 */
export function CreatorCenterHubView(props: CreatorCenterHubViewProps) {
  const {
    creatorEmail,
    creatorAvatarUrl,
    creatorInitials,
    creatorSessionTokens,
    creatorTodayTokens,
    creatorLifetimeTokens,
    onRefreshUsage,
    usageAccountLoggedIn = false,
  } = props;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
                {creatorAvatarUrl ? (
                  <img src={creatorAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{creatorInitials}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{creatorEmail ?? "创作者账号"}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">ID: —</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {creatorEmail ? "会员：未开通" : "游客"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {usageAccountLoggedIn ? "账号 · 用量同步 · 个人提示词" : "账号 · 本机用量 · 个人提示词"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/40 bg-background/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">今日 AI 用量</h3>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={onRefreshUsage}
              >
                刷新
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { label: "本会话", value: creatorSessionTokens, highlight: false },
                { label: "今日累计", value: creatorTodayTokens, highlight: true },
                {
                  label: usageAccountLoggedIn ? "终身累计" : "本机累计",
                  value: creatorLifetimeTokens,
                  highlight: false,
                },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    highlight ? "border border-primary/20 bg-primary/8" : "bg-background/60"
                  }`}
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="text-right">
                    <span
                      className={`font-bold tabular-nums text-sm ${highlight ? "text-primary" : "text-foreground"}`}
                    >
                      {formatTokenCell(value)}
                    </span>
                    <span className="ml-1 text-[9px] text-muted-foreground/60">tokens</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/50">
              {usageAccountLoggedIn ? "登录后用量记录随账号同步（粗估），非厂商计费。" : "粗估本机统计，非厂商计费。"}
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-background/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">创作资产</h3>
              <span className="text-[10px] text-muted-foreground">后续接入</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "字数仓剩余", value: "—" },
                { label: "留白笺可用", value: "—" },
                { label: "每日免费重塑", value: "0 / 0" },
                { label: "会员时效", value: "未开通" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-background/60 p-2.5">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/40 bg-background/40 p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">个人提示词中心</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">管理全局提示词、类型与收藏，在落笔与 AI 侧栏中快速复用</p>
            </div>
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <Link to="/prompts">
              进入提示词库
            </Link>
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/40 bg-background/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">快捷入口</h3>
            <div className="grid grid-cols-1 gap-2">
              <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild>
                <Link to="/reference">
                  <Library className="mr-2 h-3.5 w-3.5" />
                  藏经
                </Link>
              </Button>
              <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild>
                <Link to="/chat">
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  问策
                </Link>
              </Button>
              <Button type="button" variant="outline" className="h-9 justify-start text-xs" asChild>
                <Link to="/settings">设置</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-background/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">权益与服务</h3>
            <div className="space-y-2">
              <Button type="button" className="h-9 w-full text-sm">
                开通 / 升级会员
              </Button>
              <Button type="button" variant="secondary" className="h-8 w-full text-xs">
                获得更多字数
              </Button>
              <Button type="button" variant="outline" className="h-8 w-full text-xs">
                兑换留白笺
              </Button>
              <Button type="button" variant="outline" className="h-8 w-full text-xs" asChild>
                <Link to="/">个人主页</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
