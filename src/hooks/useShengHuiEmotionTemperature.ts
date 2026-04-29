import { useCallback, useEffect, useState } from "react";
import {
  clampShengHuiEmotionTemperature,
  type ShengHuiEmotionTemperature,
} from "../ai/sheng-hui-generate";

const LS_KEY = "liubai:shengHuiEmotionTemperature:v1";

function readInitialEmotionTemperature(): ShengHuiEmotionTemperature {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v != null) {
      const n = Number(v);
      if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
    }
  } catch {
    /* ignore */
  }
  return 3;
}

/**
 * 生辉「情绪温度」1–5，持久化到 localStorage（与作品无关的个人偏好）。
 */
export function useShengHuiEmotionTemperature() {
  const [emotionTemperature, setState] = useState<ShengHuiEmotionTemperature>(readInitialEmotionTemperature);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(emotionTemperature));
    } catch {
      /* ignore */
    }
  }, [emotionTemperature]);

  const setEmotionTemperature = useCallback((n: ShengHuiEmotionTemperature | number) => {
    setState(clampShengHuiEmotionTemperature(n));
  }, []);

  return { emotionTemperature, setEmotionTemperature };
}
