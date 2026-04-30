"use client";

import type { ChangeEvent, RefObject } from "react";
import { useEffect, useState } from "react";
import { pullAiUsageEventsFromCloudAndMerge } from "../../storage/ai-usage-cloud";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { CreatorCenterHubView } from "./creator-center-hub-view";
import { CreatorUsageInsightsView } from "./creator-usage-insights-view";

function IconUser(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconMore(props: { className?: string }) {
  return (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
    </svg>
  );
}

export type CreatorCenterPanel = "hub" | "usage";

function readAuthUserId(authUser: unknown): string | undefined {
  if (authUser && typeof authUser === "object" && "id" in authUser) {
    const id = (authUser as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

export type CreatorCenterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorEmail: string | null;
  creatorAvatarUrl: string | null;
  creatorInitials: string;
  creatorSessionTokens: number;
  creatorTodayTokens: number;
  creatorLifetimeTokens: number;
  onRefreshUsage: () => void;
  creatorFileRef: RefObject<HTMLInputElement | null>;
  onCreatorPickFile: () => void;
  onCreatorFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  creatorUploading: boolean;
  authUser: unknown;
  onLogout: () => void | Promise<void>;
};

export function CreatorCenterDialog(props: CreatorCenterDialogProps) {
  const {
    open,
    onOpenChange,
    creatorEmail,
    creatorAvatarUrl,
    creatorInitials,
    creatorSessionTokens,
    creatorTodayTokens,
    creatorLifetimeTokens,
    onRefreshUsage,
    creatorFileRef,
    onCreatorPickFile,
    onCreatorFileChange,
    creatorUploading,
    authUser,
    onLogout,
  } = props;

  const [panel, setPanel] = useState<CreatorCenterPanel>("hub");

  /** 打开创作中心、以及切入「AI 用量洞察」时立刻从云端合并用量事件（多环境/多浏览器对齐） */
  useEffect(() => {
    const uid = readAuthUserId(authUser);
    if (!open || !uid) return;
    let cancelled = false;
    void (async () => {
      await pullAiUsageEventsFromCloudAndMerge();
      if (cancelled) return;
      try {
        window.dispatchEvent(new CustomEvent("liubai:ai-usage-log-updated"));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authUser]);

  useEffect(() => {
    const uid = readAuthUserId(authUser);
    if (!open || !uid || panel !== "usage") return;
    let cancelled = false;
    void (async () => {
      await pullAiUsageEventsFromCloudAndMerge();
      if (cancelled) return;
      try {
        window.dispatchEvent(new CustomEvent("liubai:ai-usage-log-updated"));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, open, authUser]);

  function handleDialogOpenChange(next: boolean) {
    if (!next) {
      setPanel("hub");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {/* 默认含 sm:max-w-lg，须显式 sm: 覆盖；宽度取约 max-w-6xl，避免铺满屏 */}
      <DialogContent className="flex max-h-[min(88vh,840px)] w-full max-w-[min(72rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,calc(100vw-2rem))]">
        <input
          ref={creatorFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="visually-hidden"
          aria-hidden
          onChange={(ev) => void onCreatorFileChange(ev)}
        />
        <DialogHeader className="shrink-0 border-b border-border/40 bg-card/30 px-5 py-4">
          <DialogTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <IconUser className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">创作中心</span>
            </span>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={panel === "hub" ? "secondary" : "ghost"}
                  className="h-8 rounded-md px-3 text-xs"
                  onClick={() => setPanel("hub")}
                >
                  个人与提示词
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={panel === "usage" ? "secondary" : "ghost"}
                  className="h-8 rounded-md px-3 text-xs"
                  onClick={() => setPanel("usage")}
                >
                  AI 用量洞察
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="创作中心菜单">
                    <IconMore className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem disabled={!authUser || creatorUploading} onClick={() => { if (!creatorUploading) onCreatorPickFile(); }}>
                    {creatorUploading ? "头像上传中…" : "更换头像"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" disabled={!authUser} onClick={() => void onLogout()}>
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogTitle>
        </DialogHeader>

        {panel === "hub" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <CreatorCenterHubView
              creatorEmail={creatorEmail}
              creatorAvatarUrl={creatorAvatarUrl}
              creatorInitials={creatorInitials}
              creatorSessionTokens={creatorSessionTokens}
              creatorTodayTokens={creatorTodayTokens}
              creatorLifetimeTokens={creatorLifetimeTokens}
              onRefreshUsage={onRefreshUsage}
              usageAccountLoggedIn={Boolean(authUser)}
            />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CreatorUsageInsightsView />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
