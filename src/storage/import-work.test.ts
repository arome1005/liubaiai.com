import { beforeEach, describe, expect, it } from "vitest";
import { resetLiubaiDBForTests } from "../db/database";
import { listChapters, listWorks } from "../db/repo";
import { importWorkFromFile, parseMarkdownToWork, splitPlainTextIntoChapters } from "./import-work";
import { setWritingStore } from "./instance";
import { WritingStoreIndexedDB } from "./writing-store-indexeddb";

async function resetStoreAndDb() {
  await resetLiubaiDBForTests();
  setWritingStore(new WritingStoreIndexedDB());
}

beforeEach(async () => {
  await resetStoreAndDb();
});

describe("importWorkFromFile", () => {
  it("内存 txt File → 写入 IndexedDB，可列出作品与章节", async () => {
    const text = "第一章 试章甲\n正文第一段。\n\n第二章 试章乙\n第二段内容。";
    const file = new File([text], "vitest-memory.txt", { type: "text/plain" });
    const work = await importWorkFromFile(file);

    expect(work.title).toBe("vitest-memory");

    const works = await listWorks();
    expect(works.some((w) => w.id === work.id)).toBe(true);

    const chapters = await listChapters(work.id);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(chapters.map((c) => c.title).join(" ")).toMatch(/第一章/);
    expect(chapters.map((c) => c.title).join(" ")).toMatch(/第二章/);
  });
});

describe("splitPlainTextIntoChapters", () => {
  it("最小样例：两行章标题", () => {
    expect(splitPlainTextIntoChapters("第1章\na\n\n第2章\nb").length).toBe(2);
  });

  it("识别第两百章、第 10 章、第十一回（旧版漏「两」、不允许空格时会少章）", () => {
    const t =
      "第两百章 起\n" +
      "内容一\n\n" +
      "第 10 章 节名\n" +
      "内容二\n\n" +
      "第3章 末段\n" +
      "内容三";
    const ch = splitPlainTextIntoChapters(t);
    expect(ch.length).toBeGreaterThanOrEqual(3);
    expect(ch.some((c) => c.title.includes("两百"))).toBe(true);
  });

  it("无分隔符标题格式（聚合站常见）：「第47章葬皇！」应被识别为独立章节", () => {
    // 模拟聚合站 TXT：章名与章号之间无空格/分隔符
    const t =
      "第46章精彩之战\n" +
      "林风感到一阵眩晕，精彩的战役就此展开。他迈出脚步向前走去。\n\n" +
      "第47章葬皇！\n" +
      "葬皇的传说从远古流传至今，无人不知。\n\n" +
      "第48章新的开始\n" +
      "一切都将重新开始，林风握紧了手中的剑。";
    const ch = splitPlainTextIntoChapters(t);
    expect(ch.length).toBe(3);
    expect(ch[0]?.title).toMatch(/第46章/);
    expect(ch[1]?.title).toMatch(/第47章/);
    expect(ch[2]?.title).toMatch(/第48章/);
  });
});

describe("parseMarkdownToWork", () => {
  it("Word/Markdown 中大量极短 # 伪章时，若正文「第X章」更可信则采用纯文本切分", () => {
    const plain = Array.from({ length: 12 }, (_, i) => `第${i + 1}章\n` + "长".repeat(500)).join("\n\n");
    const mdSpam = Array.from({ length: 60 }, (_, i) => `# h${i + 1}\n\n短`).join("\n");
    const body = `${plain}\n\n${mdSpam}`;
    expect(splitPlainTextIntoChapters(body).length, "纯文本切章数").toBe(12);
    const r = parseMarkdownToWork(body, "mix");
    expect(r.chapters.length).toBe(12);
  });
});
