/**
 * 小说 .txt 清理：UTF-8 输入/输出，去 HTML/脚本、按规则删广告行、规范连续空行。
 *
 * 用法：
 *   node scripts/clean-novel-txt.mjs 书1.txt 书2.txt
 *   node scripts/clean-novel-txt.mjs --dir "/path/小说" --out "/path/小说-cleaned"
 *   node scripts/clean-novel-txt.mjs -i 单本.txt
 *
 * 选项见 --help。源文件需已是 UTF-8；若为 GBK，请先用系统或 iconv 转 UTF-8 再跑本脚本。
 */
import { readFile, readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 默认整行广告/站务（匹配则删行）。可在 JSON 里用 extraLinePatterns 扩展。 */
const DEFAULT_LINE_PATTERNS = [
  /^\s*https?:\/\/\S+\s*$/,
  /^\s*www\.\S+\s*$/i,
  /请记住.+域名/i,
  /请勿转载|禁止转载|谢绝转载/i,
  /更多精彩|最新章节|速度最快|无弹窗|无广告/,
  /[【\[]?本书.*?首发[]】]?/i,
  /(起点|红袖|晋江|纵横|飞卢|书耽).{0,12}(首发|网|小说)/,
  /手机阅读|手机看小说|m\.[a-z0-9-]+\./i,
  /请收藏本站|手打吧|看小说|全文字(无)?广告?/i,
  /本章节?由.+为您提供/i,
  /[〖【].{0,30}(转载|转帖|转贴).{0,30}[]〗】]/,
  /关注微信公众号|加微信号|加QQ群/i,
  /^[\s　]*广告[\s　＊\*]*$/u,
  /^[=\-*_~]{5,}\s*$/,
  /^[请访].{0,8}收藏.{0,8}网址?/i,
];

function stripHtmlToText(s) {
  let t = String(s);
  t = t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "\n");
  t = t.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "\n");
  t = t.replace(/<!\[CDATA\[[\s\S]*?]]>/g, "\n");
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n");
  t = t.replace(/<(?:br|hr)\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/g, " ");
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/&lt;/g, "<");
  t = t.replace(/&gt;/g, ">");
  t = t.replace(/&quot;/g, '"');
  t = t.replace(/&apos;/g, "'");
  t = t.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return t;
}

function rtrimLine(line) {
  return line.replace(/[ \t\f\v]+$/g, "");
}

/**
 * @param {string} text
 * @param {RegExp[]} linePatterns
 * @param {number} maxConsecutiveBlanks
 */
function cleanText(text, linePatterns, maxConsecutiveBlanks) {
  let t = text.replace(/^\uFEFF/, "");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = stripHtmlToText(t);
  const rawLines = t.split("\n");
  const outLines = [];
  for (const raw of rawLines) {
    const line = rtrimLine(String(raw).replace(/[\u200b\uFEFF\u00a0\u3000]/g, (ch) => (ch === "\u00a0" || ch === "\u3000" ? " " : "")));
    const test = line.trim();
    if (test === "") {
      outLines.push("");
      continue;
    }
    const drop = linePatterns.some((re) => re.test(test));
    if (drop) continue;
    outLines.push(line);
  }
  return collapseBlanks(outLines, maxConsecutiveBlanks) + "\n";
}

/**
 * @param {string[]} lines
 * @param {number} max
 */
function collapseBlanks(lines, max) {
  const out = [];
  let nBlank = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      nBlank += 1;
      if (nBlank <= max) out.push("");
    } else {
      nBlank = 0;
      out.push(line);
    }
  }
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function printHelp() {
  console.log(`
小说 txt 清理（UTF-8）

  node scripts/clean-novel-txt.mjs [选项] <文件1.txt> [文件2.txt ...]

  --dir <目录>     处理目录下 .txt（含子目录）
  --out <目录>     输出目录；缺省在输入旁建 cleaned/
  -i, --in-place  原位置覆盖；会先写 .bak 再覆盖

  --max-blank <n>  连续空行最多保留几条（1–5，默认 2）
  --config <path>  JSON 扩展见下方

  配置 JSON 示例（可选，--config 路径）：
  {
    "extraLinePatterns": [ "^我的固定广告句$", "\\\\.example\\\\.com" ]
  }
  每项为正则源字符串，对**去掉首尾空白后的一行**做子串测试（/i 忽略大小写），命中整行删除。

环境变量 DRY=1 只打印将处理文件不写盘。
`.trim());
}

/**
 * @param {unknown} raw
 * @returns {RegExp[]}
 */
function patternsFromConfig(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.extraLinePatterns)) {
    return [];
  }
  return raw.extraLinePatterns.map((s) => {
    if (typeof s !== "string") throw new Error("extraLinePatterns 项须为字符串正则");
    return new RegExp(s, "i");
  });
}

async function loadConfig(configPath) {
  if (!configPath) return { extra: [] };
  const p = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  if (!existsSync(p)) {
    throw new Error(`config 文件不存在: ${p}`);
  }
  const j = JSON.parse(await readFile(p, "utf8"));
  return { extra: patternsFromConfig(j) };
}

async function collectFromDir(dir) {
  const abs = path.resolve(dir);
  const out = [];
  async function walk(d) {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile() && /\.txt$/i.test(ent.name)) out.push(p);
    }
  }
  await walk(abs);
  return out.sort();
}

/**
 * @param {string} file
 * @param {string} outBase
 * @param {string | null} dirBase 使用 --dir 时传入，以保留子目录结构
 */
function targetPathFor(file, outBase, dirBase) {
  if (dirBase) {
    const rel = path.relative(dirBase, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return path.join(outBase, path.basename(file));
    }
    return path.join(outBase, rel);
  }
  return path.join(outBase, path.basename(file));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printHelp();
    process.exit(0);
  }

  const dry = process.env.DRY === "1";
  let inPlace = false;
  let fromDir = null;
  /** @type {string | null} */
  let fromDirAbs = null;
  let outDir = null;
  let maxBlank = 2;
  let configPath = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-i" || a === "--in-place") {
      inPlace = true;
      continue;
    }
    if (a === "--dir" && args[i + 1]) {
      fromDir = args[++i];
      continue;
    }
    if (a === "--out" && args[i + 1]) {
      outDir = args[++i];
      continue;
    }
    if (a === "--max-blank" && args[i + 1]) {
      const n = Number.parseInt(args[++i], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 5) maxBlank = n;
      continue;
    }
    if (a === "--config" && args[i + 1]) {
      configPath = args[++i];
      continue;
    }
    if (a.startsWith("-")) {
      console.error("未知参数:", a);
      process.exit(1);
    }
    files.push(a);
  }

  let toProcess = files.map((f) => path.resolve(f));
  if (fromDir) {
    fromDirAbs = path.resolve(fromDir);
    toProcess = await collectFromDir(fromDir);
  }
  if (toProcess.length === 0) {
    console.error("没有可处理的 .txt 文件。使用 --dir 或列出文件。");
    process.exit(1);
  }

  const { extra: extraPatterns } = await loadConfig(configPath);
  const linePatterns = [...DEFAULT_LINE_PATTERNS, ...extraPatterns];
  if (inPlace) outDir = null;
  else if (outDir) {
    outDir = path.resolve(outDir);
  } else if (fromDir) {
    outDir = path.join(path.resolve(fromDir), "cleaned");
  } else {
    outDir = path.join(path.dirname(toProcess[0]), "cleaned");
  }
  if (!inPlace && !dry) {
    await mkdir(outDir, { recursive: true });
  }

  for (const file of toProcess) {
    if (!statSync(file).isFile()) {
      console.error("跳过（非文件）:", file);
      continue;
    }
    const outFile = inPlace ? file : targetPathFor(file, outDir, fromDirAbs);
    if (dry) {
      console.log("DRY", file, "->", outFile);
      continue;
    }
    const buf = await readFile(file);
    const text = buf.toString("utf8");
    const cleaned = cleanText(text, linePatterns, maxBlank);
    if (inPlace) {
      const bak = file + ".bak";
      if (!existsSync(bak)) {
        await copyFile(file, bak);
      } else {
        const bak2 = file + ".bak." + Date.now();
        await copyFile(file, bak2);
        console.warn("已存在 .bak，额外备份为:", path.basename(bak2));
      }
      await writeFile(file, cleaned, { encoding: "utf8" });
    } else {
      await mkdir(path.dirname(outFile), { recursive: true });
      await writeFile(outFile, cleaned, { encoding: "utf8" });
    }
    console.log("OK", path.basename(file), "->", inPlace ? "(in-place + .bak)" : outFile);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
