export type SpeechCaptureState = {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error?: string;
};

type WebkitWindow = Window & {
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

function getCtor(): (new () => SpeechRecognition) | null {
  const w = window as unknown as WebkitWindow;
  return (window.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognition) | null;
}

export function createSpeechRecognizer(opts?: { lang?: string; interimResults?: boolean }): SpeechRecognition | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts?.lang ?? "zh-CN";
  rec.interimResults = opts?.interimResults ?? true;
  rec.continuous = true;
  return rec;
}

