import { useCallback, useState } from "react"
import { ADVANCED_UX_GATE_PIN } from "../util/backend-advanced-config-gate"

/**
 * 设置页「高级后端配置」门闩：先 Dialog 输码，再打开 `BackendModelConfigModal`。
 */
export function useBackendAdvancedConfigGate() {
  const [backendOpen, setBackendOpen] = useState(false)
  const [backendGateOpen, setBackendGateOpen] = useState(false)
  const [backendGatePin, setBackendGatePin] = useState("")
  const [backendGateError, setBackendGateError] = useState<string | null>(null)

  const requestOpenBackend = useCallback(() => {
    setBackendGatePin("")
    setBackendGateError(null)
    setBackendGateOpen(true)
  }, [])

  const closeBackendGate = useCallback(() => {
    setBackendGateOpen(false)
    setBackendGatePin("")
    setBackendGateError(null)
  }, [])

  const confirmBackendGate = useCallback(() => {
    if (backendGatePin.trim() === ADVANCED_UX_GATE_PIN) {
      setBackendGateOpen(false)
      setBackendGatePin("")
      setBackendGateError(null)
      setBackendOpen(true)
    } else {
      setBackendGateError("密码不正确。")
    }
  }, [backendGatePin])

  const onBackendGatePinInput = useCallback((value: string) => {
    setBackendGatePin(value)
    setBackendGateError(null)
  }, [])

  return {
    backendOpen,
    setBackendOpen,
    requestOpenBackend,
    closeBackendGate,
    confirmBackendGate,
    backendGateOpen,
    backendGatePin,
    onBackendGatePinInput,
    backendGateError,
  }
}
