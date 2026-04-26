/**
 * Imperative confirm / prompt replacements backed by Radix AlertDialog.
 *
 * Drop-in for window.confirm / window.prompt — same return semantics:
 *   confirm(msg) → Promise<boolean>
 *   prompt(msg, defaultValue?) → Promise<string | null>
 *
 * Render <ImperativeDialogProvider> once near the root; call useImperativeDialog()
 * anywhere below to get { confirm, prompt }.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmRequest {
  kind: "confirm";
  message: string;
  resolve: (ok: boolean) => void;
}

interface PromptRequest {
  kind: "prompt";
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

type DialogRequest = ConfirmRequest | PromptRequest;

interface ImperativeDialogApi {
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

const Ctx = createContext<ImperativeDialogApi | null>(null);

// ---------------------------------------------------------------------------
// Provider + rendered dialog
// ---------------------------------------------------------------------------

export function ImperativeDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState("");

  const current = queue[0] ?? null;

  const enqueue = useCallback((req: DialogRequest) => {
    setQueue((q) => [...q, req]);
  }, []);

  const dequeue = useCallback(() => {
    setQueue((q) => q.slice(1));
    setPromptValue("");
  }, []);

  const confirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => enqueue({ kind: "confirm", message, resolve })),
    [enqueue],
  );

  const prompt = useCallback(
    (message: string, defaultValue = ""): Promise<string | null> =>
      new Promise((resolve) => {
        enqueue({ kind: "prompt", message, defaultValue, resolve });
        setPromptValue(defaultValue);
      }),
    [enqueue],
  );

  const apiRef = useRef<ImperativeDialogApi>({ confirm, prompt });
  useEffect(() => {
    apiRef.current = { confirm, prompt };
  }, [confirm, prompt]);

  const [stableApi] = useState<ImperativeDialogApi>(() => ({
    confirm: (...a: Parameters<ImperativeDialogApi["confirm"]>) => apiRef.current.confirm(...a),
    prompt: (...a: Parameters<ImperativeDialogApi["prompt"]>) => apiRef.current.prompt(...a),
  }));

  function handleConfirmAction() {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(true);
    else current.resolve(promptValue);
    dequeue();
  }

  function handleCancel() {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(false);
    else current.resolve(null);
    dequeue();
  }

  return (
    <Ctx.Provider value={stableApi}>
      {children}
      <AlertDialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        {current && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {current.kind === "confirm" ? "确认" : "输入"}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-wrap">
                {current.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {current.kind === "prompt" && (
              <Input
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmAction();
                  }
                }}
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAction}>
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook co-export is standard React pattern
export function useImperativeDialog(): ImperativeDialogApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useImperativeDialog requires <ImperativeDialogProvider>");
  return ctx;
}
