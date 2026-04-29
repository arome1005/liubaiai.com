"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  addGlobalPromptTemplate,
  getGlobalPromptTemplate,
  listGlobalPromptTemplates,
  updateGlobalPromptTemplate,
} from "../db/repo";
import type { GlobalPromptTemplate } from "../db/types";
import { PromptFormFullPage } from "../components/prompts/PromptFormFullPage";
import { getSupabase } from "../lib/supabase";

export function PromptFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  const [initial, setInitial] = useState<GlobalPromptTemplate | null>(isNew ? null : null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (isNew) {
      setInitial(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const row = await getGlobalPromptTemplate(id!);
      if (!row) {
        toast.error("未找到该提示词或无权编辑");
        navigate("/prompts", { replace: true });
        return;
      }
      const { data: u } = await getSupabase().auth.getUser();
      const myId = u.user?.id;
      if (row.userId && myId && row.userId !== myId) {
        toast.error("仅可编辑自己创建的提示词");
        navigate("/prompts", { replace: true });
        return;
      }
      if (!row.userId && myId) {
        const mine = await listGlobalPromptTemplates();
        if (!mine.some((m) => m.id === row.id)) {
          toast.error("未找到可编辑的提示词");
          navigate("/prompts", { replace: true });
          return;
        }
      }
      setInitial(row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      navigate("/prompts", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, isNew, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(
    async (p: {
      title: string;
      type: GlobalPromptTemplate["type"];
      tags: string[];
      intro: string;
      body: string;
      usageMethod: string;
      status: GlobalPromptTemplate["status"];
    }) => {
      if (!p.intro.trim()) {
        toast.error("请填写提示词介绍");
        return;
      }
      setSaving(true);
      try {
        if (isNew) {
          await addGlobalPromptTemplate({
            title: p.title,
            type: p.type,
            tags: p.tags,
            intro: p.intro,
            body: p.body,
            status: p.status,
            reviewNote: "",
            usageMethod: p.usageMethod || undefined,
          });
          toast.success(p.status === "submitted" ? "已创建并提交审核" : "已保存为草稿");
        } else {
          await updateGlobalPromptTemplate(id!, {
            title: p.title,
            type: p.type,
            tags: p.tags,
            intro: p.intro,
            body: p.body,
            status: p.status,
            usageMethod: p.usageMethod || undefined,
            reviewNote: initial?.status === "rejected" && p.status === "submitted" ? "" : undefined,
          });
          toast.success("已保存");
        }
        navigate("/prompts", { replace: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "保存失败";
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [id, initial?.status, isNew, navigate],
  );

  if (loading) {
    return (
      <div className="page flex min-h-[40dvh] items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return <PromptFormFullPage mode={isNew ? "new" : "edit"} initial={initial} saving={saving} onSave={handleSave} />;
}
