export type UrlPreview = {
  title?: string;
  site?: string;
  description?: string;
};

function safeText(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
}

export function hostnameFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.hostname;
  } catch {
    return null;
  }
}

export async function fetchUrlPreview(sourceUrl: string, signal?: AbortSignal): Promise<UrlPreview> {
  const raw = sourceUrl.trim();
  if (!raw) return {};
  // 优先走同源后端代理（更稳）；失败再走 jina.ai best-effort
  try {
    const r = await fetch(`/api/url-preview?url=${encodeURIComponent(raw)}`, { signal });
    if (r.ok) {
      const data = (await r.json()) as { title?: string; site?: string; description?: string };
      return { title: safeText(data.title), site: safeText(data.site), description: safeText(data.description) };
    }
  } catch {
    /* fallback */
  }
  const u = new URL(raw);
  const proxied = `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
  const res = await fetch(proxied, { signal });
  if (!res.ok) throw new Error(`抓取失败（${res.status}）`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ogTitle = safeText(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));
  const title = ogTitle ?? safeText(doc.querySelector("title")?.textContent);
  const ogSite = safeText(doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content"));
  const site = ogSite ?? hostnameFromUrl(raw) ?? undefined;
  const ogDesc = safeText(doc.querySelector('meta[property="og:description"]')?.getAttribute("content"));
  const desc = ogDesc ?? safeText(doc.querySelector('meta[name="description"]')?.getAttribute("content"));
  return { title, site, description: desc };
}

