import { useMemo, useState, useEffect } from "react";
import { computeToneDriftHints } from "../../util/tone-drift-hint";
import { cosineDistance } from "../../util/vector-math";
import { readEmbeddingCache, writeEmbeddingCache } from "../../util/embedding-cache";
import { embedWithProvider } from "../../ai/client";
import { isLocalAiProvider } from "../../ai/local-provider";
import type { AiProviderConfig, AiProviderId } from "../../ai/types";

interface UseAiPanelToneDriftArgs {
  toneDriftHintEnabled: boolean;
  cloudAllowed: boolean;
  provider: AiProviderId;
  providerCfg: AiProviderConfig;
  bannedPhrases: string;
  styleAnchor: string;
  draft: string;
}

/**
 * 调性漂移提示（双轨）：
 * - 规则轨：`computeToneDriftHints`（同步 useMemo，无网络请求）
 * - Embedding 轨：与风格锚点做向量距离，仅云端且有 embeddingModel 时启用
 */
export function useAiPanelToneDrift(args: UseAiPanelToneDriftArgs) {
  const { toneDriftHintEnabled, cloudAllowed, provider, providerCfg, bannedPhrases, styleAnchor, draft } = args;

  // ── 规则轨（同步） ──────────────────────────────────────────────────────────
  const toneDriftHints = useMemo(() => {
    if (!toneDriftHintEnabled) return [];
    const t = draft.trim();
    if (!t) return [];
    return computeToneDriftHints({ bannedPhrases, styleAnchor, draftText: draft });
  }, [toneDriftHintEnabled, draft, bannedPhrases, styleAnchor]);

  // ── Embedding 轨（异步） ────────────────────────────────────────────────────
  const [toneEmbedHint, setToneEmbedHint] = useState<string | null>(null);
  const [toneEmbedBusy, setToneEmbedBusy] = useState(false);
  const [toneEmbedErr, setToneEmbedErr] = useState<string | null>(null);

  useEffect(() => {
    // 特性关闭 / 本地模型 / 未授权云端 → 清空并退出
    if (!toneDriftHintEnabled || isLocalAiProvider(provider) || !cloudAllowed) {
      setToneEmbedHint(null);
      setToneEmbedErr(null);
      setToneEmbedBusy(false);
      return;
    }

    const embModel = (providerCfg.embeddingModel ?? "").trim();
    const anchor = (styleAnchor ?? "").trim();
    const t = draft.trim();

    if (!embModel || anchor.length < 24 || t.length < 24) {
      setToneEmbedHint(null);
      setToneEmbedErr(null);
      setToneEmbedBusy(false);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setToneEmbedBusy(true);
    setToneEmbedErr(null);

    void (async () => {
      try {
        const aText = anchor.slice(0, 2400);
        const bText = t.slice(0, 2400);
        const cachedA = readEmbeddingCache(provider, embModel, aText);
        const cachedB = readEmbeddingCache(provider, embModel, bText);
        const a =
          cachedA ??
          (await embedWithProvider({ provider, config: providerCfg, input: aText, signal: ac.signal })).embedding;
        const b =
          cachedB ??
          (await embedWithProvider({ provider, config: providerCfg, input: bText, signal: ac.signal })).embedding;
        if (!cachedA) writeEmbeddingCache(provider, embModel, aText, a);
        if (!cachedB) writeEmbeddingCache(provider, embModel, bText, b);

        const dist = cosineDistance(a, b);
        if (dist == null) throw new Error("embedding 距离计算失败");

        // 经验阈值：>0.22 认为差异明显；>0.30 强提示。仅提示不阻断。
        const line =
          dist >= 0.3
            ? `标杆段距离偏大（cos 距离≈${dist.toFixed(2)}），草稿调性可能明显偏离文风锚点。`
            : dist >= 0.22
              ? `标杆段距离略大（cos 距离≈${dist.toFixed(2)}），建议对照文风锚点检查节奏/用词。`
              : null;

        if (cancelled) return;
        setToneEmbedHint(line);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "embedding 计算失败";
        setToneEmbedErr(msg);
        setToneEmbedHint(null);
      } finally {
        if (!cancelled) setToneEmbedBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 该 effect 仅关心调性提示相关输入
  }, [toneDriftHintEnabled, cloudAllowed, providerCfg, styleAnchor, draft]);

  return { toneDriftHints, toneEmbedHint, toneEmbedBusy, toneEmbedErr };
}
