import { describe, expect, it } from "vitest";
import {
  analyzeMojibakeRepair,
  displayOffsetsToRawOffsets,
  rawOffsetsToDisplayOffsets,
} from "./repair-mojibake-display";

describe("repair-mojibake-display", () => {
  it("restores UTF-8 Chinese from Latin-1–preserved bytes", () => {
    const bytes = new Uint8Array([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]);
    const latin1 = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    const { display, kind } = analyzeMojibakeRepair(latin1);
    expect(kind).toBe("latin1-utf8");
    expect(display).toBe("你好");
  });

  it("maps raw ↔ display offsets for latin1-utf8", () => {
    const bytes = new Uint8Array([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]);
    const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    const { display, kind } = analyzeMojibakeRepair(raw);
    expect(kind).toBe("latin1-utf8");
    const forward = rawOffsetsToDisplayOffsets(raw, kind, 3, 6);
    expect(forward).toEqual({ start: 1, end: 2 });
    const back = displayOffsetsToRawOffsets(raw, kind, display.length, 0, 1);
    expect(back).toEqual({ start: 0, end: 3 });
  });

  it("leaves healthy UTF-16 Chinese unchanged", () => {
    const s = "第一章：风起。\n正文在这里。";
    const { display, kind } = analyzeMojibakeRepair(s);
    expect(kind).toBe("none");
    expect(display).toBe(s);
  });
});
