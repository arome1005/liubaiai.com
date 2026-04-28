/**
 * 大纲中人物名与锦囊列表交叉检测。
 * 采用「长名优先 + 非重叠」扫描，减少「子串误命中」；**单字名**不参与自动检测，避免「李/李子」类歧义，用户可在未来扩展为对单字用边界判断后再纳入。
 */
export function findOutlineMentionedCharacterNames(
  outlineText: string,
  characters: { name: string }[],
): Set<string> {
  const text = outlineText;
  if (!text) return new Set();
  const raw = characters
    .map((c) => c.name.trim())
    .filter((n) => n.length > 0);
  if (!raw.length) return new Set();

  const unique = [...new Set(raw)];
  unique.sort((a, b) => b.length - a.length);
  const withLen = unique.map((n) => ({ n, len: n.length }));
  if (!withLen.length) return new Set();

  const covered: boolean[] = new Array(text.length);
  for (let k = 0; k < text.length; k++) covered[k] = false;
  const matched = new Set<string>();

  let i = 0;
  while (i < text.length) {
    if (covered[i]) {
      i++;
      continue;
    }
    let hit: { n: string; len: number } | null = null;
    for (const { n, len } of withLen) {
      if (len < 2) continue;
      if (i + len > text.length) continue;
      if (text.slice(i, i + len) !== n) continue;
      hit = { n, len };
      break;
    }
    if (hit) {
      for (let j = i; j < i + hit.len; j++) covered[j] = true;
      matched.add(hit.n);
      i += hit.len;
    } else {
      i++;
    }
  }
  return matched;
}
