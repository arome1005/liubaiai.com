/**
 * 高级后端配置 · 隐私与上传范围 panel。
 *
 * 纯展示组件：仅依赖 settings + onChange，无内部 state。
 * 控制「云端调用同意」+「拼入 prompt 的具体内容范围」。
 */
import type { AiSettings } from "../../ai/types";
import { BCard, BHead } from "./_shared";

export function PrivacyPanel({
  settings,
  onChange,
}: {
  settings: AiSettings;
  onChange: (next: AiSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <BCard>
        <BHead
          title="AI 隐私与上传范围"
          sub="只要你点击「生成」，提示词会发送到所选提供方。潜龙（Ollama/MLX）为本地接口，不经过云端开关。"
        />
        <div className="space-y-2">
          {[
            {
              key: "consentAccepted" as const,
              label: "我已阅读并理解：使用云端模型会上传提示词内容",
            },
            {
              key: "allowCloudProviders" as const,
              label:
                "允许使用云端提供方（OpenAI / Claude / Gemini / 豆包 / 智谱 / Kimi / 小米 等；不含本地 Ollama/MLX）",
            },
          ].map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2.5"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(settings.privacy[key])}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    privacy: {
                      ...settings.privacy,
                      [key]: e.target.checked,
                      ...(key === "consentAccepted"
                        ? { consentAcceptedAt: e.target.checked ? Date.now() : undefined }
                        : {}),
                    },
                  })
                }
              />
              <span className="text-sm leading-snug text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </BCard>

      <BCard>
        <BHead
          title="上传范围"
          sub="仅对云端提供方生效。控制「是否将对应内容拼入 prompt」，不影响本地查看/编辑。"
        />
        <div className="space-y-2">
          {(
            [
              ["allowMetadata", "作品名 / 章节名等元数据"],
              ["allowChapterContent", "当前章正文（全文或截断）"],
              ["allowSelection", "当前选区"],
              ["allowRecentSummaries", "最近章节概要"],
              ["allowBible", "本书锦囊（导出 Markdown）"],
              ["allowLinkedExcerpts", "本章关联摘录（参考库）"],
              ["allowRagSnippets", "参考库检索片段（RAG 注入）"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={Boolean(settings.privacy[k as keyof AiSettings["privacy"]])}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    privacy: { ...settings.privacy, [k]: e.target.checked },
                  })
                }
              />
              <span className="text-xs text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </BCard>
    </div>
  );
}
