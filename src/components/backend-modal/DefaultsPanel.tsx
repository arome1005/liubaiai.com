/**
 * 高级后端配置 · 默认与上下文 panel。
 *
 * - 默认 provider / 默认锦囊注入 / 上下文字符上限
 * - 侧栏注入确认（粗估 token 阈值、向云端发锦囊前确认）
 * - 调性漂移提示 + 本会话粗估 token 上限
 *
 * 纯展示组件：依赖 settings + onChange。
 */
import type { AiProviderId, AiSettings } from "../../ai/types";
import { BCard, BField, BHead } from "./_shared";

export function DefaultsPanel({
  settings,
  onChange,
}: {
  settings: AiSettings;
  onChange: (next: AiSettings) => void;
}) {
  return (
    <div className="space-y-4">
      <BCard>
        <BHead title="默认与上下文" />
        <div className="space-y-3">
          <BField label="默认提供方">
            <select
              className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              value={settings.provider}
              onChange={(e) =>
                onChange({ ...settings, provider: e.target.value as AiProviderId })
              }
            >
              <option value="openai">见山（OpenAI）</option>
              <option value="anthropic">听雨（Claude）</option>
              <option value="gemini">观云（Gemini）</option>
              <option value="vertex">Vertex AI（GCP）</option>
              <option value="doubao">燎原（豆包）</option>
              <option value="zhipu">智谱 GLM</option>
              <option value="kimi">Kimi</option>
              <option value="xiaomi">小米 MiMo</option>
              <option value="ollama">潜龙（Ollama）</option>
              <option value="mlx">潜龙（MLX）</option>
            </select>
          </BField>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2">
            <input
              type="checkbox"
              checked={settings.includeBible}
              onChange={(e) => onChange({ ...settings, includeBible: e.target.checked })}
            />
            <span className="text-sm text-foreground">默认注入本书锦囊</span>
          </label>
          <BField label="上下文上限（字符）">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={4000}
                max={200000}
                value={settings.maxContextChars}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    maxContextChars: Number(e.target.value) || 24000,
                  })
                }
                className="w-36 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <span className="text-xs text-muted-foreground">字符</span>
            </div>
          </BField>
        </div>
      </BCard>

      <BCard>
        <BHead
          title="侧栏注入确认"
          sub="防误触 / 控制费用。可按粗估 tokens 或「发锦囊」弹出确认。粗估非计费凭证。"
        />
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2">
            <input
              type="checkbox"
              checked={settings.injectConfirmOnOversizeTokens}
              onChange={(e) =>
                onChange({ ...settings, injectConfirmOnOversizeTokens: e.target.checked })
              }
            />
            <span className="text-sm text-foreground">粗估超过阈值时要求确认</span>
          </label>
          <BField label="粗估 token 阈值">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={500000}
                value={settings.injectApproxTokenThreshold}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    injectApproxTokenThreshold: Math.max(
                      0,
                      Math.min(500_000, Number(e.target.value) || 0),
                    ),
                  })
                }
                className="w-36 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <span className="text-xs text-muted-foreground">0 = 仅其它规则</span>
            </div>
          </BField>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2">
            <input
              type="checkbox"
              checked={settings.injectConfirmCloudBible}
              onChange={(e) =>
                onChange({ ...settings, injectConfirmCloudBible: e.target.checked })
              }
            />
            <span className="text-sm text-foreground">
              向云端发送本书锦囊前始终确认（建议开启）
            </span>
          </label>
        </div>
      </BCard>

      <BCard>
        <BHead
          title="调性与本会话成本"
          sub="调性提示在草稿区展示风格参考。会话上限按当前标签页累计粗估 tokens（关标签页即清零）。"
        />
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-2">
            <input
              type="checkbox"
              checked={settings.toneDriftHintEnabled}
              onChange={(e) =>
                onChange({ ...settings, toneDriftHintEnabled: e.target.checked })
              }
            />
            <span className="text-sm text-foreground">侧栏草稿生成后显示调性漂移提示</span>
          </label>
          <BField label="本会话侧栏累计上限（粗估 tokens）">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={2000000}
                value={settings.aiSessionApproxTokenBudget}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    aiSessionApproxTokenBudget: Math.max(
                      0,
                      Math.min(2_000_000, Math.floor(Number(e.target.value) || 0)),
                    ),
                  })
                }
                className="w-40 rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <span className="text-xs text-muted-foreground">0 = 不限制</span>
            </div>
          </BField>
        </div>
      </BCard>
    </div>
  );
}
