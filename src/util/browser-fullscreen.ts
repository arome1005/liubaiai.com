/** 浏览器原生全屏（隐藏标签栏/地址栏等），需用户手势触发 request */

export function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

export function requestDocumentFullscreen(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  try {
    if (typeof el.requestFullscreen === "function") {
      return el.requestFullscreen().then(() => true, () => false);
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      el.webkitRequestFullscreen();
      return Promise.resolve(true);
    }
    if (typeof el.mozRequestFullScreen === "function") {
      el.mozRequestFullScreen();
      return Promise.resolve(true);
    }
    if (typeof el.msRequestFullscreen === "function") {
      el.msRequestFullscreen();
      return Promise.resolve(true);
    }
  } catch {
    /* ignore */
  }
  return Promise.resolve(false);
}

export function exitDocumentFullscreen(): Promise<void> {
  const d = document as Document & {
    webkitExitFullscreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  if (!getFullscreenElement()) return Promise.resolve();
  try {
    if (typeof document.exitFullscreen === "function") {
      return document.exitFullscreen().catch(() => {});
    }
    if (typeof d.webkitExitFullscreen === "function") {
      d.webkitExitFullscreen();
      return Promise.resolve();
    }
    if (typeof d.mozCancelFullScreen === "function") {
      d.mozCancelFullScreen();
      return Promise.resolve();
    }
    if (typeof d.msExitFullscreen === "function") {
      d.msExitFullscreen();
      return Promise.resolve();
    }
  } catch {
    /* ignore */
  }
  return Promise.resolve();
}
