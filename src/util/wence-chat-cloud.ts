import { getSupabase } from "../lib/supabase";
import type { AiSettings } from "../ai/types";
import type { WenceSessionStored } from "./wence-chat-sessions";

export type WenceCloudSyncResult = {
  pulled: number;
  pushed: number;
  skipped: number;
};

export function canSyncWenceToCloud(settings: AiSettings): boolean {
  // 问策会话包含用户正文/对话，视为"云端上传范围"一部分；仅在用户明确允许时开启。
  return Boolean(settings.privacy.consentAccepted && settings.privacy.allowCloudProviders);
}

type WenceCloudRow = {
  id: string;
  user_id: string;
  title: string;
  work_id: string | null;
  include_setting_index: boolean;
  messages: unknown;
  updated_at: number;
};

function toCloudRow(uid: string, s: WenceSessionStored, settings: AiSettings): WenceCloudRow {
  const allowMeta = settings.privacy.allowMetadata;
  return {
    id: s.id,
    user_id: uid,
    title: s.title,
    work_id: allowMeta ? s.workId : null,
    include_setting_index: Boolean(s.includeSettingIndex),
    messages: s.messages,
    updated_at: s.updatedAt,
  };
}

function isValidStoredSession(x: unknown): x is WenceSessionStored {
  if (!x || typeof x !== "object") return false;
  const v = (x as { v?: unknown }).v;
  const id = (x as { id?: unknown }).id;
  const title = (x as { title?: unknown }).title;
  const workId = (x as { workId?: unknown }).workId;
  const includeSettingIndex = (x as { includeSettingIndex?: unknown }).includeSettingIndex;
  const messages = (x as { messages?: unknown }).messages;
  const updatedAt = (x as { updatedAt?: unknown }).updatedAt;
  if (v !== 1) return false;
  if (typeof id !== "string" || !id) return false;
  if (typeof title !== "string") return false;
  if (workId !== null && typeof workId !== "string") return false;
  if (typeof includeSettingIndex !== "boolean") return false;
  if (!Array.isArray(messages)) return false;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return false;
  return true;
}

export async function pullWenceSessionsFromCloud(args: {
  settings: AiSettings;
  /** 返回本机已存在的 session（用于 merge 决策） */
  listLocal: () => WenceSessionStored[];
  /** 将云端/合并后的 session 写回本机 */
  upsertLocal: (s: WenceSessionStored) => void;
}): Promise<WenceCloudSyncResult> {
  if (!canSyncWenceToCloud(args.settings)) {
    return { pulled: 0, pushed: 0, skipped: 0 };
  }
  const sb = getSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return { pulled: 0, pushed: 0, skipped: 0 };

  const local = args.listLocal();
  const localById = new Map(local.map((s) => [s.id, s] as const));

  const { data, error } = await sb
    .from("wence_chat_session")
    .select("id,title,work_id,include_setting_index,messages,updated_at")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  let pulled = 0;
  let skipped = 0;
  for (const row of (data ?? []) as Array<Partial<WenceCloudRow>>) {
    const candidate: unknown = {
      v: 1,
      id: row.id,
      title: row.title ?? "对话",
      workId: row.work_id ?? null,
      includeSettingIndex: Boolean(row.include_setting_index),
      messages: Array.isArray(row.messages) ? row.messages : [],
      updatedAt: typeof row.updated_at === "number" ? row.updated_at : 0,
    };
    if (!isValidStoredSession(candidate)) {
      skipped += 1;
      continue;
    }
    const prev = localById.get(candidate.id);
    if (prev && prev.updatedAt >= candidate.updatedAt) {
      skipped += 1;
      continue;
    }
    args.upsertLocal(candidate);
    pulled += 1;
  }
  return { pulled, pushed: 0, skipped };
}

export async function pushWenceSessionToCloud(args: {
  settings: AiSettings;
  session: WenceSessionStored;
}): Promise<{ pushed: boolean }> {
  if (!canSyncWenceToCloud(args.settings)) return { pushed: false };
  const sb = getSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return { pushed: false };

  const row = toCloudRow(uid, args.session, args.settings);
  const { error } = await sb
    .from("wence_chat_session")
    .upsert(row as never, { onConflict: "id" })
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
  return { pushed: true };
}

