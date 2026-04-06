/** 设置页「虚构创作说明」勾选状态；不设为「1」时不影响现有生成流程（仅记录用户主动确认）。 */
export const FICTION_CREATION_ACK_KEY = "liubai:fictionCreationAck";

export function readFictionCreationAcknowledged(): boolean {
  try {
    return localStorage.getItem(FICTION_CREATION_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFictionCreationAcknowledged(on: boolean): void {
  try {
    if (on) localStorage.setItem(FICTION_CREATION_ACK_KEY, "1");
    else localStorage.removeItem(FICTION_CREATION_ACK_KEY);
  } catch {
    /* ignore */
  }
}
