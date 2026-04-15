/**
 * 中文网文「第…章/节/回/卷/集/篇」节号识别（导入切章、参考库章节行等共用）。
 * 与旧版相比：补「两、零、〇」、允许「第」与节号、节号与「章」之间空格（如第 100 章），并含 集/篇。
 */

/** 「第」与「章」之间的数字部分：中文数字或阿拉伯数字 */
export const CN_CHAPTER_NUMERAL = String.raw`(?:[一二三四五六七八九十百千万两零〇]+|\d+)`;

/**
 * 紧接「第」的一节标识（不含行首尾空白），例如：第两百章、第 10 章、第两千零一章
 * 注意：「两千」含「两」，旧版仅 [一二…] 会漏「第两百章」「第两千章」等。
 */
export const CHAPTER_ID_AFTER_DI = String.raw`第\s*${CN_CHAPTER_NUMERAL}\s*[章节回卷集篇]`;

/** 参考库：一行以常见章节标题样式开头（后可跟同行情节名） */
export const CHAPTER_HEAD_LINE_REGEX = new RegExp(String.raw`^\s*${CHAPTER_ID_AFTER_DI}.*`, "gm");
