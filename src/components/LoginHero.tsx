import { Fragment, useCallback, useEffect, useRef, useState } from "react";

const TRANSITION = "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)";

export type LoginHeroProps = {
  isEmailFocus: boolean;
  isPasswordVisible: boolean;
};

type Vec2 = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pupilOffsetScreen(
  eyeSx: number,
  eyeSy: number,
  mouseSx: number,
  mouseSy: number,
  maxR: number,
): Vec2 {
  const dx = mouseSx - eyeSx;
  const dy = mouseSy - eyeSy;
  const dist = Math.hypot(dx, dy) || 1;
  const t = clamp(maxR, 0, maxR);
  return { x: (dx / dist) * t, y: (dy / dist) * t };
}

function peekPupilOffset(maxR: number): Vec2 {
  return { x: maxR * 0.94, y: maxR * 0.08 };
}

type BlobId = "blue" | "orange" | "black" | "yellow";

type BlobConfig = {
  id: BlobId;
  left: number;
  bottom: number;
  width: number;
  height: number;
  rx: number;
  fill: string;
  z: number;
  eye: "dot" | "goggle";
  eyeL: Vec2;
  eyeR: Vec2;
  pupilMax: number;
  bodyPath?: string;
  mouthLine?: { x1: number; y: number; x2: number };
};

const CONFIG: BlobConfig[] = [
  {
    id: "blue",
    left: 18,
    bottom: 0,
    width: 44,
    height: 112,
    rx: 22,
    fill: "#5A4FCF",
    z: 1,
    eye: "goggle",
    eyeL: { x: 11, y: 42 },
    eyeR: { x: 29, y: 42 },
    pupilMax: 4,
  },
  {
    id: "orange",
    left: 6,
    bottom: 0,
    width: 118,
    height: 40,
    rx: 18,
    fill: "#ED7D4D",
    z: 5,
    eye: "dot",
    eyeL: { x: 34, y: 18 },
    eyeR: { x: 72, y: 18 },
    pupilMax: 3.2,
    bodyPath: "M 0 22 Q 59 4 118 22 L 118 40 L 0 40 Z",
  },
  {
    id: "black",
    left: 64,
    bottom: 0,
    width: 32,
    height: 76,
    rx: 10,
    fill: "#1A1A1A",
    z: 3,
    eye: "goggle",
    eyeL: { x: 7.5, y: 28 },
    eyeR: { x: 22.5, y: 28 },
    pupilMax: 3.4,
  },
  {
    id: "yellow",
    left: 124,
    bottom: 0,
    width: 70,
    height: 40,
    rx: 18,
    fill: "#E3C552",
    z: 4,
    eye: "dot",
    eyeL: { x: 20, y: 16 },
    eyeR: { x: 44, y: 16 },
    pupilMax: 3.2,
    mouthLine: { x1: 24, y: 28, x2: 46 },
  },
];

const CLUSTER_W = 194;
const CLUSTER_H = 120;

const LAYOUT_STORAGE_KEY = "login-hero-layout-v2";

export type BlobLayout = {
  left: number;
  bottom: number;
  /** 相对 CONFIG 宽度的横向拉伸 */
  scaleX: number;
  /** 相对 CONFIG 高度的纵向拉伸（可与小蓝/小黑比例不同） */
  scaleY: number;
};

export type LoginHeroLayout = {
  clusterOffsetX: number;
  clusterOffsetY: number;
  clusterScale: number;
  blobs: Record<BlobId, BlobLayout>;
};

const DEFAULT_BLOB_LAYOUT = (): Record<BlobId, BlobLayout> => ({
  blue: { left: CONFIG[0].left, bottom: CONFIG[0].bottom, scaleX: 1, scaleY: 1 },
  orange: { left: CONFIG[1].left, bottom: CONFIG[1].bottom, scaleX: 1, scaleY: 1 },
  black: { left: CONFIG[2].left, bottom: CONFIG[2].bottom, scaleX: 1, scaleY: 1 },
  yellow: { left: CONFIG[3].left, bottom: CONFIG[3].bottom, scaleX: 1, scaleY: 1 },
});

const DEFAULT_LAYOUT: LoginHeroLayout = {
  clusterOffsetX: 0,
  clusterOffsetY: 0,
  clusterScale: 1,
  blobs: DEFAULT_BLOB_LAYOUT(),
};

function clampBlobLayout(bl: BlobLayout): BlobLayout {
  return {
    left: clamp(bl.left, -80, 400),
    bottom: clamp(bl.bottom, -80, 400),
    scaleX: clamp(bl.scaleX, 0.15, 5),
    scaleY: clamp(bl.scaleY, 0.15, 5),
  };
}

/** 兼容旧版仅 scale 字段 */
function normalizeBlobLayout(raw: unknown, fallback: BlobLayout): BlobLayout {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const left = Number(o.left);
  const bottom = Number(o.bottom);
  if (typeof o.scaleX === "number" || typeof o.scaleY === "number") {
    return clampBlobLayout({
      left: Number.isFinite(left) ? left : fallback.left,
      bottom: Number.isFinite(bottom) ? bottom : fallback.bottom,
      scaleX: Number(o.scaleX) || 1,
      scaleY: Number(o.scaleY) || 1,
    });
  }
  if ("scale" in o) {
    const sc = Number(o.scale) || 1;
    return clampBlobLayout({
      left: Number.isFinite(left) ? left : fallback.left,
      bottom: Number.isFinite(bottom) ? bottom : fallback.bottom,
      scaleX: sc,
      scaleY: sc,
    });
  }
  return fallback;
}

function clampLayoutState(l: LoginHeroLayout): LoginHeroLayout {
  const blobs = { ...l.blobs };
  for (const cfg of CONFIG) {
    const b = blobs[cfg.id] ?? DEFAULT_BLOB_LAYOUT()[cfg.id];
    blobs[cfg.id] = clampBlobLayout(b);
  }
  return {
    clusterOffsetX: clamp(l.clusterOffsetX, -400, 400),
    clusterOffsetY: clamp(l.clusterOffsetY, -400, 400),
    clusterScale: clamp(l.clusterScale, 0.35, 3),
    blobs,
  };
}

function migrateLegacyTune(raw: unknown): Partial<LoginHeroLayout> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("blobs" in o) return null;
  const offsetX = Number(o.offsetX);
  const offsetY = Number(o.offsetY);
  const scale = Number(o.scale);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY) || !Number.isFinite(scale)) return null;
  return {
    clusterOffsetX: offsetX,
    clusterOffsetY: offsetY,
    clusterScale: scale,
    blobs: DEFAULT_BLOB_LAYOUT(),
  };
}

function loadLayout(): LoginHeroLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<LoginHeroLayout>;
      if (j.blobs && typeof j.blobs === "object") {
        const base = DEFAULT_BLOB_LAYOUT();
        const blobs = { ...base } as Record<BlobId, BlobLayout>;
        for (const cfg of CONFIG) {
          const raw = (j.blobs as Record<string, unknown>)[cfg.id];
          blobs[cfg.id] = normalizeBlobLayout(raw, base[cfg.id]);
        }
        const merged: LoginHeroLayout = {
          ...DEFAULT_LAYOUT,
          ...j,
          blobs,
        };
        return clampLayoutState(merged);
      }
    }
    const legacy = localStorage.getItem("login-hero-tune");
    if (legacy) {
      const m = migrateLegacyTune(JSON.parse(legacy));
      if (m) return clampLayoutState({ ...DEFAULT_LAYOUT, ...m });
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

function saveLayout(l: LoginHeroLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

function BlobBody(props: { cfg: BlobConfig }) {
  const { cfg } = props;
  if (cfg.bodyPath) {
    return <path d={cfg.bodyPath} fill={cfg.fill} />;
  }
  return <rect x={0} y={0} width={cfg.width} height={cfg.height} rx={cfg.rx} fill={cfg.fill} />;
}

function Eyes(props: {
  cfg: BlobConfig;
  offL: Vec2;
  offR: Vec2;
  hidden: boolean;
}) {
  const { cfg, offL, offR, hidden } = props;
  const lx = cfg.eyeL.x;
  const ly = cfg.eyeL.y;
  const rx = cfg.eyeR.x;
  const ry = cfg.eyeR.y;

  if (cfg.eye === "dot") {
    return (
      <g opacity={hidden ? 0 : 1} style={{ transition: TRANSITION }}>
        <circle cx={lx} cy={ly} r={3} fill="#1a1a1a" />
        <circle cx={rx} cy={ry} r={3} fill="#1a1a1a" />
        <circle cx={lx + offL.x} cy={ly + offL.y} r={1.3} fill="#fff" opacity={0.35} />
        <circle cx={rx + offR.x} cy={ry + offR.y} r={1.3} fill="#fff" opacity={0.35} />
        {cfg.mouthLine ? (
          <line
            x1={cfg.mouthLine.x1}
            y1={cfg.mouthLine.y}
            x2={cfg.mouthLine.x2}
            y2={cfg.mouthLine.y}
            stroke="#1a1a1a"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={hidden ? 0 : 1}
            style={{ transition: TRANSITION }}
          />
        ) : null}
      </g>
    );
  }
  return (
    <g opacity={hidden ? 0 : 1} style={{ transition: TRANSITION }}>
      <circle cx={lx} cy={ly} r={6.2} fill="#fff" />
      <circle cx={rx} cy={ry} r={6.2} fill="#fff" />
      <circle cx={lx + offL.x} cy={ly + offL.y} r={2.6} fill="#111" />
      <circle cx={rx + offR.x} cy={ry + offR.y} r={2.6} fill="#111" />
    </g>
  );
}

function BackMark(props: { cfg: BlobConfig; show: boolean }) {
  const { cfg, show } = props;
  const cx = cfg.width / 2;
  const cy = cfg.height / 2;
  return (
    <g opacity={show ? 1 : 0} style={{ transition: TRANSITION }}>
      <ellipse cx={cx} cy={cy - 2} rx={cfg.width * 0.3} ry={cfg.height * 0.18} fill="rgba(0,0,0,0.12)" />
      <path
        d={`M ${cx - 10} ${cy + 6} Q ${cx} ${cy - 3} ${cx + 10} ${cy + 6}`}
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  );
}

function BlobCharacter(props: {
  cfg: BlobConfig;
  layout: BlobLayout;
  mouseScreen: Vec2;
  isEmailFocus: boolean;
  isPasswordVisible: boolean;
  trackMouse: boolean;
  editLayout: boolean;
  stackIndex: number;
  registerBlob?: (id: BlobId, el: HTMLDivElement | null) => void;
}) {
  const {
    cfg,
    layout,
    mouseScreen,
    isEmailFocus,
    isPasswordVisible,
    trackMouse,
    editLayout,
    stackIndex,
    registerBlob,
  } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [, setMounted] = useState(0);

  const setWrapRef = useCallback(
    (el: HTMLDivElement | null) => {
      (wrapRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      registerBlob?.(cfg.id, el);
      setMounted((n) => n + 1);
    },
    [cfg.id, registerBlob],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMounted((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let offL: Vec2 = { x: 0, y: 0 };
  let offR: Vec2 = { x: 0, y: 0 };

  /* 眼位随鼠标：读包裹层 DOM 矩形；ResizeObserver + setMounted 保证布局变化后会重算 */
  /* eslint-disable react-hooks/refs -- 与鼠标同步算瞳孔偏移；非 ref 作数据源，仅量 DOM */
  if (trackMouse && wrapRef.current) {
    const r = wrapRef.current.getBoundingClientRect();
    const sx = (px: number) => r.left + (px / cfg.width) * r.width;
    const sy = (py: number) => r.top + (py / cfg.height) * r.height;
    const eyeLSx = sx(cfg.eyeL.x);
    const eyeLSy = sy(cfg.eyeL.y);
    const eyeRSx = sx(cfg.eyeR.x);
    const eyeRSy = sy(cfg.eyeR.y);

    if (cfg.id === "blue" && isEmailFocus) {
      const p = peekPupilOffset(cfg.pupilMax);
      offL = p;
      offR = p;
    } else {
      offL = pupilOffsetScreen(eyeLSx, eyeLSy, mouseScreen.x, mouseScreen.y, cfg.pupilMax);
      offR = pupilOffsetScreen(eyeRSx, eyeRSy, mouseScreen.x, mouseScreen.y, cfg.pupilMax);
    }
  }
  /* eslint-enable react-hooks/refs */

  const blueLift = cfg.id === "blue" && isEmailFocus && !isPasswordVisible;
  const rotY = isPasswordVisible ? 180 : 0;
  /** 布局编辑时取消小紫倾斜，避免与覆盖层手柄错位；叠层命中由独立层处理 */
  const baseTransform = editLayout
    ? ""
    : cfg.id === "blue"
      ? isPasswordVisible
        ? ""
        : blueLift
          ? "translateY(-16px) rotate(-5deg)"
          : "rotate(-5deg)"
      : "";

  const sx = layout.scaleX;
  const sy = layout.scaleY;
  const combinedTransform = [baseTransform, `scale(${sx}, ${sy})`].filter(Boolean).join(" ").trim();

  const paintZ = editLayout ? 20 + stackIndex : cfg.z;

  return (
    <div
      ref={setWrapRef}
      data-blob-id={cfg.id}
      style={{
        position: "absolute",
        left: layout.left,
        bottom: layout.bottom,
        width: cfg.width,
        height: cfg.height,
        zIndex: paintZ,
        transformStyle: "preserve-3d",
        transform: combinedTransform,
        transformOrigin: "left bottom",
        transition: editLayout ? "none" : TRANSITION,
        touchAction: editLayout ? "none" : undefined,
        outline: editLayout ? "1px dashed rgba(255,255,255,0.35)" : undefined,
        borderRadius: 4,
        /* 编辑时本体不接收指针，避免大橙挡住其它团子；移动/缩放在 BlobEditOverlay */
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: `rotateY(${rotY}deg)`,
          transition: TRANSITION,
        }}
      >
        <svg width={cfg.width} height={cfg.height} style={{ display: "block", overflow: "visible" }}>
          <BlobBody cfg={cfg} />
          <Eyes cfg={cfg} offL={offL} offR={offR} hidden={isPasswordVisible} />
          <BackMark cfg={cfg} show={isPasswordVisible} />
        </svg>
      </div>
    </div>
  );
}

/** 手柄单独一层且后渲染，不被团子叠层挡住；容器 pointer-events:none 仅按钮可点 */
function BlobEditOverlay(props: {
  blobs: Record<BlobId, BlobLayout>;
  onMovePointerDown: (e: React.PointerEvent, id: BlobId) => void;
  onResizePointerDown: (e: React.PointerEvent, id: BlobId) => void;
}) {
  const { blobs, onMovePointerDown, onResizePointerDown } = props;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 500,
      }}
    >
      {CONFIG.map((cfg) => {
        const bl = blobs[cfg.id];
        const W = cfg.width * bl.scaleX;
        const H = cfg.height * bl.scaleY;
        const L = bl.left;
        const B = bl.bottom;
        return (
          <Fragment key={cfg.id}>
            <button
              type="button"
              aria-label={`移动团子 ${cfg.id}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onMovePointerDown(e, cfg.id);
              }}
              style={{
                position: "absolute",
                left: L + W / 2 - 28,
                bottom: B + H / 2 - 11,
                width: 56,
                height: 22,
                padding: 0,
                pointerEvents: "auto",
                cursor: "grab",
                border: "1px dashed rgba(255,255,255,0.45)",
                borderRadius: 4,
                background: "rgba(0,0,0,0.25)",
              }}
            />
            <button
              type="button"
              aria-label={`拉伸团子 ${cfg.id}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizePointerDown(e, cfg.id);
              }}
              style={{
                position: "absolute",
                left: L + W - 18,
                bottom: B,
                width: 18,
                height: 18,
                padding: 0,
                pointerEvents: "auto",
                cursor: "nwse-resize",
                border: "1px solid rgba(255,255,255,0.6)",
                borderRadius: 3,
                background: "rgba(80,120,255,0.95)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
              }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function useNarrowHero() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 840px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

type DragKind = "blob" | "resize" | "cluster" | "group";

export function LoginHero({ isEmailFocus, isPasswordVisible }: LoginHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clusterInnerRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<Record<BlobId, HTMLDivElement | null>>({
    blue: null,
    orange: null,
    black: null,
    yellow: null,
  });

  const [mouseScreen, setMouseScreen] = useState<Vec2>({ x: 0, y: 0 });
  const [layout, setLayout] = useState<LoginHeroLayout>(() => loadLayout());
  const [editLayout, setEditLayout] = useState(false);

  const narrow = useNarrowHero();
  const trackMouse = !isPasswordVisible;
  const narrowScale = narrow ? 0.92 : 1;
  const clusterPixelScale = layout.clusterScale * narrowScale;

  const dragRef = useRef<{
    kind: DragKind;
    id?: BlobId;
    startX: number;
    startY: number;
    startLayout: LoginHeroLayout;
    startScaleX?: number;
    startScaleY?: number;
  } | null>(null);

  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  useEffect(() => {
    if (!trackMouse) return;
    const onWinMove = (e: MouseEvent) => {
      setMouseScreen({ x: e.clientX, y: e.clientY });
    };
    const init = () => {
      if (rootRef.current) {
        const r = rootRef.current.getBoundingClientRect();
        setMouseScreen({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
    };
    init();
    window.addEventListener("mousemove", onWinMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onWinMove);
    };
  }, [trackMouse]);

  const clampBlobsInRoot = useCallback(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const rr = rootEl.getBoundingClientRect();

    setLayout((prev) => {
      let next = { ...prev, blobs: { ...prev.blobs } };
      const tryClamp = (blobs: Record<BlobId, BlobLayout>) => {
        for (const cfg of CONFIG) {
          const el = blobRefs.current[cfg.id];
          if (!el) continue;
          const br = el.getBoundingClientRect();
          let dx = 0;
          let dy = 0;
          if (br.left < rr.left) dx = rr.left - br.left;
          else if (br.right > rr.right) dx = rr.right - br.right;
          if (br.top < rr.top) dy = rr.top - br.top;
          else if (br.bottom > rr.bottom) dy = rr.bottom - br.bottom;
          if (dx === 0 && dy === 0) continue;
          const b = blobs[cfg.id];
          blobs[cfg.id] = {
            ...b,
            left: b.left + dx / clusterPixelScale,
            bottom: b.bottom - dy / clusterPixelScale,
          };
        }
      };

      for (let i = 0; i < 8; i++) {
        tryClamp(next.blobs);
      }

      let co = { x: next.clusterOffsetX, y: next.clusterOffsetY };
      for (let i = 0; i < 12; i++) {
        const inner = clusterInnerRef.current;
        if (!inner) break;
        const ir = inner.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (ir.left < rr.left) dx = rr.left - ir.left;
        else if (ir.right > rr.right) dx = rr.right - ir.right;
        if (ir.top < rr.top) dy = rr.top - ir.top;
        else if (ir.bottom > rr.bottom) dy = rr.bottom - ir.bottom;
        if (dx === 0 && dy === 0) break;
        co = { x: co.x + dx, y: co.y + dy };
      }

      next = { ...next, clusterOffsetX: co.x, clusterOffsetY: co.y };
      return clampLayoutState(next);
    });
  }, [clusterPixelScale]);

  const onBlobPointerDown = useCallback(
    (e: React.PointerEvent, id: BlobId) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: e.shiftKey ? "group" : "blob",
        id,
        startX: e.clientX,
        startY: e.clientY,
        startLayout: layout,
      };
    },
    [layout],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, id: BlobId) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "resize",
        id,
        startX: e.clientX,
        startY: e.clientY,
        startLayout: layout,
        startScaleX: layout.blobs[id].scaleX,
        startScaleY: layout.blobs[id].scaleY,
      };
    },
    [layout],
  );

  const onClusterBgPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editLayout || e.button !== 0) return;
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "cluster",
        startX: e.clientX,
        startY: e.clientY,
        startLayout: layout,
      };
    },
    [editLayout, layout],
  );

  const registerBlob = useCallback((id: BlobId, el: HTMLDivElement | null) => {
    blobRefs.current[id] = el;
  }, []);

  useEffect(() => {
    if (!editLayout) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const s = clusterPixelScale;

      if (d.kind === "cluster") {
        setLayout(
          clampLayoutState({
            ...d.startLayout,
            clusterOffsetX: d.startLayout.clusterOffsetX + dx,
            clusterOffsetY: d.startLayout.clusterOffsetY + dy,
          }),
        );
        return;
      }

      if (d.kind === "blob" && d.id) {
        const bid = d.id;
        setLayout(
          clampLayoutState({
            ...d.startLayout,
            blobs: {
              ...d.startLayout.blobs,
              [bid]: {
                ...d.startLayout.blobs[bid],
                left: d.startLayout.blobs[bid].left + dx / s,
                bottom: d.startLayout.blobs[bid].bottom - dy / s,
              },
            },
          }),
        );
        return;
      }

      if (d.kind === "group") {
        const blobs = { ...d.startLayout.blobs };
        for (const cfg of CONFIG) {
          const bid = cfg.id;
          blobs[bid] = {
            ...blobs[bid],
            left: d.startLayout.blobs[bid].left + dx / s,
            bottom: d.startLayout.blobs[bid].bottom - dy / s,
          };
        }
        setLayout(clampLayoutState({ ...d.startLayout, blobs }));
        return;
      }

      if (d.kind === "resize" && d.id && d.startScaleX !== undefined && d.startScaleY !== undefined) {
        const bid = d.id;
        const cfg = CONFIG.find((c) => c.id === bid);
        if (!cfg) return;
        const nextScaleX = clamp(d.startScaleX + dx / (s * cfg.width), 0.15, 5);
        const nextScaleY = clamp(d.startScaleY + dy / (s * cfg.height), 0.15, 5);
        setLayout(
          clampLayoutState({
            ...d.startLayout,
            blobs: {
              ...d.startLayout.blobs,
              [bid]: { ...d.startLayout.blobs[bid], scaleX: nextScaleX, scaleY: nextScaleY },
            },
          }),
        );
      }
    };

    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        requestAnimationFrame(() => clampBlobsInRoot());
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editLayout, clusterPixelScale, clampBlobsInRoot]);

  return (
    <>
      <style>{`
        .login-hero-root {
          perspective: 960px;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 240px;
          background: #2b2b2b;
          overflow: hidden;
        }
      `}</style>
      <div ref={rootRef} className="login-hero-root" role="img" aria-label="留白吉祥物">
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "clamp(72px, 22vh, 220px)",
            transform: `translate(calc(-50% + ${layout.clusterOffsetX}px), ${layout.clusterOffsetY}px)`,
            width: CLUSTER_W,
            height: CLUSTER_H,
            zIndex: 1,
            pointerEvents: editLayout ? "auto" : "none",
          }}
        >
          <div
            ref={clusterInnerRef}
            onPointerDown={onClusterBgPointerDown}
            style={{
              width: CLUSTER_W,
              height: CLUSTER_H,
              position: "relative",
              transform: `scale(${clusterPixelScale})`,
              transformOrigin: "center top",
              background: editLayout ? "rgba(255,255,255,0.04)" : undefined,
              borderRadius: editLayout ? 8 : undefined,
            }}
          >
            {CONFIG.map((cfg, stackIndex) => (
              <BlobCharacter
                key={cfg.id}
                cfg={cfg}
                layout={layout.blobs[cfg.id]}
                mouseScreen={mouseScreen}
                isEmailFocus={isEmailFocus}
                isPasswordVisible={isPasswordVisible}
                trackMouse={trackMouse}
                editLayout={editLayout}
                stackIndex={stackIndex}
                registerBlob={registerBlob}
              />
            ))}
            {editLayout ? (
              <BlobEditOverlay blobs={layout.blobs} onMovePointerDown={onBlobPointerDown} onResizePointerDown={onResizePointerDown} />
            ) : null}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            zIndex: 30,
            maxWidth: 300,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setEditLayout((prev) => !prev)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: editLayout ? "rgba(80,120,255,0.55)" : "rgba(0,0,0,0.45)",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            {editLayout ? "完成布局编辑" : "布局编辑（拖拽团子）"}
          </button>
          {editLayout ? (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                background: "rgba(0,0,0,0.78)",
                color: "#eee",
                fontSize: 11,
                lineHeight: 1.45,
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <p style={{ margin: "0 0 6px" }}>
                每个团子有<strong>中间虚线条</strong>（移动）和<strong>右下角蓝点</strong>（横/竖分别拉伸）。空白背景拖整组；按住{" "}
                <strong>Shift</strong> 再拖移动条可<strong>整组</strong>平移。
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span>整组缩放</span>
                <input
                  type="range"
                  min={35}
                  max={300}
                  step={1}
                  value={Math.round(layout.clusterScale * 100)}
                  onChange={(e) =>
                    setLayout((prev) =>
                      clampLayoutState({
                        ...prev,
                        clusterScale: Number(e.target.value) / 100,
                      }),
                    )
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{layout.clusterScale.toFixed(2)}</span>
              </label>
              <button
                type="button"
                onClick={() => setLayout(DEFAULT_LAYOUT)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eee",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                恢复默认布局
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
