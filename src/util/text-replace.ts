/** 字面量替换（非正则），查找串为空时不修改 */
export function replaceFirstLiteral(haystack: string, needle: string, repl: string): string {
  if (!needle) return haystack;
  const i = haystack.indexOf(needle);
  if (i < 0) return haystack;
  return haystack.slice(0, i) + repl + haystack.slice(i + needle.length);
}

export function replaceAllLiteral(haystack: string, needle: string, repl: string): string {
  if (!needle) return haystack;
  return haystack.split(needle).join(repl);
}
