/** 留白作品标签：入库规范化与装配器侧写（`tagProfileText`，含题材/世界观防串台） */

export function normalizeWorkTagList(input: string[] | undefined | null): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  if (!input?.length) return undefined;
  for (const s of input) {
    const t = String(s).trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.length ? out : undefined;
}

/** 用户输入一行：逗号、顿号或空白分隔 */
export function parseWorkTagsInputLine(line: string): string[] {
  return line
    .split(/[,，、\s]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 与 `WORK_TAG_GROUPS` 中题材名及常见自定义变体对齐（精确匹配规范化后的标签） */
function collectGenreWorldConstraints(tags: string[]): string[] {
  const set = new Set(tags.map((t) => t.trim()).filter(Boolean));
  const blocks: string[] = [];
  const seen = new Set<string>();

  const push = (id: string, text: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    blocks.push(text);
  };

  const xh =
    set.has("玄幻") || set.has("仙侠") || set.has("修真") || set.has("洪荒") || set.has("武侠");
  if (xh) {
    push(
      "xh",
      "「玄幻/仙侠类」：叙事世界须保持东方玄幻、修真或武侠江湖等已写设定。除正文、本书锦囊或用户本轮明确要求外，禁止将主场景写成现代都市日常（手机、互联网、汽车、地铁、写字楼格子间、外卖快递等当代符号）；禁止用明显现代职场话术充当默认世界；人物力量体系、宗门/朝堂结构须与上文连贯，不得无铺垫切换到现代背景。",
    );
  }

  if (set.has("都市")) {
    push(
      "urban",
      "「都市」类：默认当代或近现代城市生活语境。除非正文、锦囊已写，禁止将主世界无故写成古代朝堂、修真宗门或异世界作为主舞台；若存在异能/系统，须与上文规则一致。",
    );
  }

  if (set.has("历史")) {
    push(
      "hist",
      "「历史」类：器物、称谓、礼制与时代感须与已写朝代/架空设定一致；禁止混入手机、互联网等明显现代物，除非正文已设定穿越或架空例外。",
    );
  }

  if (set.has("科幻")) {
    push(
      "sf",
      "「科幻」类：科技与社会设定须自洽；禁止在无铺垫时退化为神仙修真或纯古装演义作为主矛盾来源。",
    );
  }

  if (set.has("悬疑")) {
    push(
      "sus",
      "「悬疑」类：线索、动机与时间线须与上文连续；禁止突然改写成与主案件无关的篇幅或切换时代背景。",
    );
  }

  if (set.has("言情")) {
    push(
      "rom",
      "「言情」类：人物关系与情感线须与上文连续；禁止无铺垫切换时代、身份或主舞台。",
    );
  }

  if (set.has("同人") || set.has("同人衍生")) {
    push(
      "fan",
      "「同人/衍生」类：不得编造与用户正文及常识中原作明显冲突的核心设定；二创边界与平台合规由用户负责，续写须尊重已写设定。",
    );
  }

  if (set.has("无限流")) {
    push(
      "inf",
      "「无限流」类：副本与主神/空间规则以正文为准；禁止擅自引入与上文体系无关的全新主世界类型。",
    );
  }

  if (set.has("系统流")) {
    push(
      "sys",
      "「系统流」类：系统面板、任务与奖励规则须与上文一致；禁止无故更换系统性质或世界底层规则。",
    );
  }

  if (set.has("重生")) {
    push(
      "re",
      "「重生」类：时间线、前世信息与当前世界状态以正文为准；续写不得与已写重生前提矛盾。",
    );
  }

  if (set.has("穿越")) {
    push(
      "tr",
      "「穿越」类：穿越前后世界与身份以正文锚定为准；若同时存在多种题材标签，以正文已落地的主世界为准，禁止无伏笔跳时代或混台。",
    );
  }

  if (blocks.length >= 2) {
    push(
      "multi",
      "（多题材标签并存时：以正文与本书锦囊已确立的主世界与矛盾为准；续写不得在无用户明示时合并互斥的时代符号。）",
    );
  }

  return blocks;
}

/**
 * 装配器用侧写：标签列表 + 题材/世界观硬性约束（防模型串台）。
 * 与本书锦囊、风格卡冲突时，assemble-context 中仍以锦囊与风格卡优先说明为准。
 */
export function workTagsToProfileText(tags: string[] | undefined | null): string | undefined {
  const n = normalizeWorkTagList(tags ?? undefined);
  if (!n?.length) return undefined;

  const bullets = n.map((x) => `- ${x}`).join("\n");
  const genres = collectGenreWorldConstraints(n);
  if (!genres.length) {
    return bullets;
  }

  return (
    `${bullets}\n\n【题材与世界观约束（留白标签驱动，防串台）】\n` +
    genres.map((g) => `• ${g}`).join("\n")
  );
}
