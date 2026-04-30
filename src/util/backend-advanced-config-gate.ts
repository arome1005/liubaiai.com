/**
 * 多处置用的同一误触门闩码：设置里「高级后端」、以及「高级接入（侧车）」等。仅作误触/好奇防护，不视为安全凭据（前端可检视）。
 */
export const ADVANCED_UX_GATE_PIN = "1005"

/** 与 `ADVANCED_UX_GATE_PIN` 同值；保留别名，便于在「高级后端」语境下读代码。 */
export const BACKEND_ADVANCED_CONFIG_PIN = ADVANCED_UX_GATE_PIN
