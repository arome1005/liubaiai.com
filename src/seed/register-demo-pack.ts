/**
 * 新注册用户（本地库为空时）注入截图级演示数据，便于上手与展示。
 * 全部带「演示包」标签，可像普通数据一样编辑、删除。
 */
import {
  addBibleCharacter,
  addBibleTimelineEvent,
  addBibleWorldEntry,
  addInspirationFragment,
  createChapter,
  createVolume,
  createWork,
  listChapters,
  listVolumes,
  listWorks,
  updateWork,
  updateChapter,
  updateVolume,
  upsertChapterBible,
  upsertWorkStyleCard,
} from "../db/repo";

const LS_KEY = "liubai:registerDemoPack:v2";
const DEMO_TAG = "演示包";

const DEMO_BODY_LINE =
  "（演示正文）远山如黛，偶有修士御剑掠过云层。本段为留白写作内置演示数据，可整书删除或单章清空。\n\n";

function repeatBody(targetChars: number): string {
  let s = "";
  while (s.length < targetChars) s += DEMO_BODY_LINE;
  return s.slice(0, targetChars);
}

let inflight: Promise<void> | null = null;

async function runSeedOnce(userId: string): Promise<void> {
  const lsKey = `${LS_KEY}:${userId}`;
  let markDone = false;
  try {
    const works = await listWorks();
    if (works.length > 0) {
      markDone = true;
      return;
    }
    await seedAll();
    markDone = true;
  } catch (e) {
    console.error("[register-demo-pack]", e);
  } finally {
    if (markDone) {
      try {
        localStorage.setItem(lsKey, "1");
      } catch {
        /* ignore */
      }
    }
  }
}

export function seedRegisterDemoPackIfEligible(userId: string): Promise<void> {
  if (!userId.trim()) return Promise.resolve();
  if (inflight) return inflight;

  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(`${LS_KEY}:${userId}`) === "1") {
      return Promise.resolve();
    }
  } catch {
    /* ignore */
  }

  const finish = (): void => {
    inflight = null;
  };

  /** Web Locks：同浏览器配置下多标签页串行，避免并发展示包双写。lib.dom 对 Promise 回调推断偏宽，故 `unknown` 断言。 */
  if (typeof navigator !== "undefined" && navigator.locks) {
    const locked = navigator.locks.request(`liubai:register-demo-pack:${userId}`, async () => {
      await runSeedOnce(userId);
    });
    inflight = (locked as unknown as Promise<void>).finally(finish);
  } else {
    inflight = runSeedOnce(userId).finally(finish);
  }

  return inflight;
}

async function seedAll(): Promise<void> {
  const wUrban = await createWork("都市之巅峰强者", {
    tags: ["都市", "兵王", "爽文", "连载中", DEMO_TAG, "星标"],
  });
  await fillWorkWithChapters(wUrban.id, 22, 2400);

  const wLing = await createWork("凌云志", {
    tags: ["玄幻", "升级", "热血", "连载中", DEMO_TAG, "星标"],
  });
  await seedLingyunDemo(wLing.id);

  const wSci = await createWork("星际迷航", {
    tags: ["科幻", "探险", "硬核", "草稿中", DEMO_TAG],
  });
  await fillWorkWithChapters(wSci.id, 14, 2200);

  const wGhost = await createWork("诡异修仙路", {
    tags: ["修仙", "诡异", "心理", "已暂停", DEMO_TAG],
  });
  await fillWorkWithChapters(wGhost.id, 12, 2100);

  const wRom = await createWork("穿越成为公主后", {
    tags: ["穿越", "言情", "宫斗", "已完结", DEMO_TAG, "星标"],
  });
  await fillWorkWithChapters(wRom.id, 32, 2600);

  await seedInspirationFragments(wLing.id);
}

async function fillWorkWithChapters(workId: string, chapterCount: number, charsPerChapter: number): Promise<void> {
  const vols = await listVolumes(workId);
  const vid = vols[0]?.id;
  if (!vid) {
    throw new Error("演示包：作品缺少默认卷，已中止写入。");
  }
  for (let i = 0; i < chapterCount; i++) {
    const ch = await createChapter(workId, `第 ${i + 1} 章`, vid);
    await updateChapter(ch.id, { content: repeatBody(charsPerChapter) });
  }
  const chapters = await listChapters(workId);
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? sorted[0];
  if (mid) {
    await updateWork(workId, { progressCursor: mid.id });
  }
}

async function seedLingyunDemo(workId: string): Promise<void> {
  const vols = await listVolumes(workId);
  const v1 = vols[0];
  if (!v1) {
    throw new Error("演示包：《凌云志》缺少默认卷，已中止写入。");
  }
  await updateVolume(v1.id, {
    title: "第一卷：命运的起点",
    summary: "少年离家、荒野求生、古洞奇遇，为踏入修途埋下伏笔。",
  });
  const v2 = await createVolume(workId, "第二卷：风云际会");
  const v3 = await createVolume(workId, "第三卷：龙争虎斗");

  const ch11 = await createChapter(workId, "第一章：落魄少年", v1.id);
  const summary1 =
    "林风因家族变故而流落荒野，在落仙崖附近意外坠入古洞，发现刻有古老文字的石碑，为后续修炼埋下伏笔。";
  const opening =
    "暮色四合，林风背着破旧的行囊站在青云镇外的山路上。身后是再回不去的家门，前方是未知与险途。\n\n" +
    repeatBody(1800);
  await updateChapter(ch11.id, { summary: summary1, content: opening });
  await upsertChapterBible({
    chapterId: ch11.id,
    workId,
    goalText:
      "冲突点：生存压力、身世之谜。\n标签：#铺垫 #伏笔\n场景要点：被逐出家门 → 荒野求生 → 古洞奇遇（神秘石碑）。",
    forbidText: "",
    povText: "第三人称有限，贴近林风视角。",
    sceneStance:
      "子项（场景备忘）：被逐出家门；荒野求生；古洞奇遇。\n" +
      "涉及地点：青云镇、落仙崖。",
    characterStateText: "登场人物：林风、林母（回忆/侧面）。林风：疲惫、警惕、不甘。",
  });

  const ch12 = await createChapter(workId, "第二章：踏入修途", v1.id);
  await updateChapter(ch12.id, {
    summary: "初窥门径，引气入体，隐约察觉石碑与自身血脉有关。",
    content: repeatBody(2200),
  });

  const ch13 = await createChapter(workId, "第三章：青云门试", v1.id);
  await updateChapter(ch13.id, {
    summary: "赴青云门参加外门考核，初遇同辈与规矩。",
    content: repeatBody(2200),
  });

  const ch21 = await createChapter(workId, "第一章：内门风波", v2.id);
  await updateChapter(ch21.id, { content: repeatBody(2300) });

  const ch31 = await createChapter(workId, "楔子：风暴前夕", v3.id);
  await updateChapter(ch31.id, { content: repeatBody(2000) });

  await upsertWorkStyleCard(workId, {
    pov: "第三人称有限（主跟林风）",
    tone: "玄幻热血，节奏明快，伏笔回收偏长线。",
    bannedPhrases: "系统提示音\n无脑打脸",
    styleAnchor:
      "剑光如练，山风猎猎。林风按住胸口，那里有一道旧伤，也有不肯熄灭的火。",
    extraRules: "演示包：可整书删除。",
  });

  await addBibleCharacter(workId, {
    name: "林风",
    motivation: "活下去，变强，弄清身世与石碑之谜。",
    relationships: "与林母羁绊深厚；与同门亦敌亦友。",
    voiceNotes: "克制、短句多，怒时不吼，笑时不浮。",
    taboos: "不说「我命由我不由天」式口号堆砌。",
  });
  await addBibleCharacter(workId, {
    name: "林母",
    motivation: "保护儿子，承受家族压力。",
    relationships: "林风之母。",
    voiceNotes: "柔中带刚。",
    taboos: "",
  });

  await addBibleWorldEntry(workId, {
    entryKind: "地理",
    title: "青云镇",
    body: "边陲小镇，修士往来，坊市与消息集散地。",
  });
  await addBibleWorldEntry(workId, {
    entryKind: "地理",
    title: "落仙崖",
    body: "断崖险峻，传说曾有仙人对弈，崖下多古洞。",
  });

  await addBibleTimelineEvent(workId, {
    label: "林风离家",
    note: "第一卷起点事件。",
    chapterId: ch11.id,
  });

  const allCh = await listChapters(workId);
  const sorted = [...allCh].sort((a, b) => a.order - b.order);
  const cursor = sorted[2] ?? sorted[0];
  if (cursor) {
    await updateWork(workId, { progressCursor: cursor.id });
  }
}

async function seedInspirationFragments(lingyunWorkId: string): Promise<void> {
  await addInspirationFragment({
    workId: null,
    tags: ["人物", "情感", DEMO_TAG],
    body:
      "【文字】角色心理转变\n\n" +
      "主角在得知真相后的反应不应该是愤怒，而是一种更深层的悲伤和自我怀疑。这样可以让角色更加立体，也为后续的成长埋下伏笔。",
  });

  await addInspirationFragment({
    workId: null,
    tags: ["情感", "人物", DEMO_TAG],
    body:
      "【引用】关于自我认知\n\n" +
      "人最难的不是认识别人，而是认识自己。我们总是在别人身上看到自己的影子，却不愿意承认那就是自己。\n\n" +
      "——《人间失格》太宰治",
  });

  await addInspirationFragment({
    workId: null,
    tags: ["世界观", "设定", DEMO_TAG],
    body:
      "【想法】修仙体系新解读\n\n" +
      "如果修仙世界的「道」其实是一种高维信息体，修炼的本质是让自己的意识能够解码这种信息？这样可以解释为什么顿悟如此重要。",
  });

  await addInspirationFragment({
    workId: null,
    tags: ["人物", "冲突", DEMO_TAG],
    body:
      "【语音】反派角色塑造（演示无音频文件）\n\n" +
      "关于反派动机的思考：他不是为了毁灭世界，而是为了重建一个他认为更公平的世界。他的方法是错误的，但他的初衷是可以理解的。",
  });

  await addInspirationFragment({
    workId: null,
    tags: ["节奏", "参考", DEMO_TAG],
    body:
      "【书签】叙事节奏研究\n\n" +
      "这篇文章关于叙事节奏非常有参考价值，特别是关于「张弛有度」的部分，可以用在连载节奏控制上。",
  });

  await addInspirationFragment({
    workId: null,
    tags: ["对话", "修行", DEMO_TAG],
    body:
      "【文字】师徒对话片段\n\n" +
      "「师父，为什么您总说修行如逆水行舟？」「因为顺流而下的，从来不是你自己选择的方向。」",
  });

  await addInspirationFragment({
    workId: lingyunWorkId,
    tags: ["随机灵感", DEMO_TAG],
    body:
      "【关联《凌云志》】角色心理转变（摘录）\n\n" +
      "主角在得知真相后的反应不应该是愤怒，而是一种更深层的悲伤和自我怀疑。",
  });
}
