import { useState, useRef, useCallback } from "react";

export type ConfirmOptions = {
  title: string;
  description: string;
  actionText: string;
  destructive?: boolean;
};

export type ConfirmState =
  | { open: false }
  | {
      open: true;
      title: string;
      description: string;
      actionText: string;
      destructive?: boolean;
    };

export function useConfirmDialog() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmOnce = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setConfirmState({
        open: true,
        ...opts,
      });
    });
  }, []);

  const onConfirmAction = useCallback(async (action: () => Promise<void> | void) => {
    if (confirmBusy) return;
    setConfirmBusy(true);
    try {
      await action();
    } catch (err) {
      console.error("Confirm action failed:", err);
    } finally {
      setConfirmBusy(false);
      setConfirmState({ open: false });
      // We don't resolve here anymore because the promise was resolved to true to trigger this.
    }
  }, [confirmBusy]);

  const onCancel = useCallback(() => {
    if (confirmBusy) return;
    setConfirmState({ open: false });
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, [confirmBusy]);

  const handleConfirm = useCallback(() => {
    // This resolves the promise to true
    if (confirmBusy) return;
    resolveRef.current?.(true);
    resolveRef.current = null;
    // Note: We don't close the dialog here if the caller intends to use onConfirmAction
    // But if the caller DOES NOT use onConfirmAction, they should manually close it or we need a way.
    // Let's assume if they use await confirmOnce, they want to handle it.
  }, [confirmBusy]);

  return {
    confirmState,
    confirmBusy,
    setConfirmBusy,
    confirmOnce,
    onConfirmAction,
    onCancel,
    handleConfirm,
  };
}
