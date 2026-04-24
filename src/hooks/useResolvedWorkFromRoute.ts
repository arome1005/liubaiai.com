import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getWork, resolveWorkIdFromRouteParam, backfillMissingWorkBookNumbers } from "../db/repo";
import type { Work } from "../db/types";
import { workPathSegment } from "../util/work-url";

let backfillOnce: Promise<void> | null = null;
function runBackfillOnce(): Promise<void> {
  if (!backfillOnce) backfillOnce = backfillMissingWorkBookNumbers().catch(() => {});
  return backfillOnce;
}

/**
 * `/work/:workId/…` 中 workId 可为书号（纯数字）或作品 UUID；返回内部 `resolvedWorkId` 与 `work`。
 * 若用 UUID 打开且该书已有 `bookNo`，会 replace 为 `/work/{bookNo}/同后缀`。
 */
export function useResolvedWorkFromRoute() {
  const { workId: param } = useParams<{ workId: string }>();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [resolvedWorkId, setResolvedWorkId] = useState<string | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [phase, setPhase] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let c = false;
    (async () => {
      if (!param) {
        if (!c) {
          setResolvedWorkId(null);
          setWork(null);
          setPhase("notfound");
        }
        return;
      }
      if (!c) setPhase("loading");
      await runBackfillOnce();
      const id = await resolveWorkIdFromRouteParam(param);
      if (c) return;
      if (!id) {
        setResolvedWorkId(null);
        setWork(null);
        setPhase("notfound");
        return;
      }
      const w = await getWork(id);
      if (c) return;
      if (!w) {
        setResolvedWorkId(null);
        setWork(null);
        setPhase("notfound");
        return;
      }
      setResolvedWorkId(id);
      setWork(w);
      setPhase("ok");
      if (w.bookNo != null && param === w.id) {
        const m = pathname.match(/^\/work\/[^/]+(.*)$/);
        const rest = m?.[1] ?? "";
        navigate({ pathname: `/work/${workPathSegment(w)}${rest}`, search, hash }, { replace: true });
      }
    })();
    return () => {
      c = true;
    };
  }, [param, pathname, search, hash, navigate]);

  return { resolvedWorkId, work, phase, routeParam: param };
}
